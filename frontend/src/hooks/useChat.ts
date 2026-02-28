import { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const API_BASE = '/api';
const USER_ID = crypto.randomUUID();

type Phase = 'idle' | 'thinking' | 'streaming';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [agentName, setAgentName] = useState('Eyebalz');

  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<string | null>(null);
  const channelRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  // Streaming DOM ref — caller attaches this to a <span>, we write textContent directly
  const streamRef = useRef<HTMLSpanElement | null>(null);
  const streamBuf = useRef('');

  // Timers
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamStaleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let dead = false;

    (async () => {
      try {
        // 1. Get agents
        const agentRes = await fetch(`${API_BASE}/agents`);
        if (!agentRes.ok || dead) return;
        const agentData = await agentRes.json();
        const agents = agentData.data?.agents || agentData.agents || [];
        if (agents.length === 0 || dead) return;
        const agent = agents[0];
        setAgentName(agent.name || 'Eyebalz');

        // 2. Create session
        const sessRes = await fetch(`${API_BASE}/messaging/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agent.id, userId: USER_ID }),
        });
        if (!sessRes.ok || dead) return;
        const sess = await sessRes.json();
        sessionRef.current = sess.sessionId;
        channelRef.current = sess.channelId;

        // 3. Connect socket
        const socket = io(window.location.origin, {
          auth: { entityId: USER_ID },
          transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => {
          if (dead) return;
          setConnected(true);
          // Join channel room (SOCKET_MESSAGE_TYPE.ROOM_JOINING = 1)
          socket.emit('1', {
            channelId: sess.channelId,
            entityId: USER_ID,
            messageServerId: '00000000-0000-0000-0000-000000000000',
          });
        });

        socket.on('disconnect', () => !dead && setConnected(false));

        // --- Streaming chunks: write to DOM, skip React ---
        socket.on('messageStreamChunk', (data: any) => {
          if (!data.chunk || !data.messageId) return;

          // First chunk → switch to streaming phase (1 render)
          if (!streamBuf.current) {
            setPhase('streaming');
          }
          streamBuf.current += data.chunk;

          // Write directly to DOM
          if (streamRef.current) {
            streamRef.current.textContent = streamBuf.current;
          }

          // Reset stream-stale timeout (30s no chunks → force done)
          if (streamStaleTimer.current) clearTimeout(streamStaleTimer.current);
          streamStaleTimer.current = setTimeout(() => finish(), 30_000);
        });

        // --- Final message broadcast ---
        socket.on('messageBroadcast', (data: any) => {
          if (!data.text && !data.content) return;
          const text = data.text || data.content;
          const msgId = data.id || crypto.randomUUID();

          // Clear streaming state
          if (streamStaleTimer.current) clearTimeout(streamStaleTimer.current);
          streamBuf.current = '';
          setPhase('thinking'); // stay "thinking" until debounce confirms we're done

          // Deduplicate & add message
          setMessages(prev =>
            prev.some(m => m.id === msgId)
              ? prev
              : [...prev, { id: msgId, role: 'assistant', text, timestamp: Date.now() }],
          );

          // Debounce done: wait 3s silence (multi-step actions send several broadcasts)
          if (doneTimer.current) clearTimeout(doneTimer.current);
          doneTimer.current = setTimeout(() => finish(), 3000);
        });

        socketRef.current = socket;
      } catch {
        // agent not running — silently fail
      }
    })();

    return () => {
      dead = true;
      clearAll();
      socketRef.current?.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    setPhase('idle');
    busyRef.current = false;
    streamBuf.current = '';
    if (doneTimer.current) clearTimeout(doneTimer.current);
    if (staleTimer.current) clearTimeout(staleTimer.current);
    if (streamStaleTimer.current) clearTimeout(streamStaleTimer.current);
  }

  function clearAll() {
    if (doneTimer.current) clearTimeout(doneTimer.current);
    if (staleTimer.current) clearTimeout(staleTimer.current);
    if (streamStaleTimer.current) clearTimeout(streamStaleTimer.current);
  }

  function send(text: string) {
    if (!sessionRef.current || busyRef.current) return;
    busyRef.current = true;

    // Add user message
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
    }]);

    setPhase('thinking');
    streamBuf.current = '';

    // Safety timeout: 60s max wait
    if (staleTimer.current) clearTimeout(staleTimer.current);
    staleTimer.current = setTimeout(() => finish(), 60_000);

    // Fire-and-forget POST — response comes via socket
    fetch(`${API_BASE}/messaging/sessions/${sessionRef.current}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    }).catch(() => finish());
  }

  return { agentName, messages, send, phase, connected, streamRef };
}
