// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FlashAgent — BAP-578 Non-Fungible Agent (NFA)
 * @notice On-chain identity for the Flash AI prediction market trading agent.
 * @dev Implements BAP-578 NFA standard on BNB Chain.
 *
 * BAP-578 defines a standard for AI agent identity on-chain:
 * - Each agent is an ERC-721 NFT with rich metadata
 * - Agent can hold assets (USDT, etc.) and execute trades
 * - On-chain reputation via trade count and success rate
 * - Verifiable agent state stored as Merkle root
 */
contract FlashAgent is ERC721, ERC721URIStorage, Ownable {
    // ═══ Agent Metadata ═══
    struct AgentMetadata {
        string persona;        // "prediction market trader"
        string experience;     // "cross-platform arbitrage, deep research"
        string[] capabilities; // List of supported actions
        uint256 createdAt;
        bool active;
    }

    // ═══ Trade Record ═══
    struct TradeStats {
        uint256 totalTrades;
        uint256 successfulTrades;
        uint256 totalVolume;     // in wei
        bytes32 stateRoot;       // Merkle root of trade history
        uint256 lastUpdated;
    }

    // ═══ State Variables ═══
    uint256 private _nextTokenId;
    mapping(uint256 => AgentMetadata) public agentMetadata;
    mapping(uint256 => TradeStats) public tradeStats;
    mapping(uint256 => mapping(string => string)) public agentState;

    // ═══ ERC-8004 Bridge ═══
    address public identityRegistry;
    uint256 public erc8004AgentId;

    // ═══ Events ═══
    event AgentMinted(uint256 indexed tokenId, address indexed owner, string persona);
    event TradeRecorded(uint256 indexed tokenId, uint256 totalTrades, uint256 successCount, bytes32 stateRoot);
    event AgentStateUpdated(uint256 indexed tokenId, string key, string value);
    event AgentFunded(uint256 indexed tokenId, uint256 amount);
    event IdentityLinked(address indexed registry, uint256 indexed agentId);

    constructor() ERC721("Flash Agent NFA", "FLASH") Ownable(msg.sender) {}

    // ═══ Core Functions ═══

    /**
     * @notice Mint a new Flash agent NFA
     * @param to Address to receive the NFA
     * @param persona Agent's role description
     * @param experience Agent's experience description
     * @param uri Metadata URI (IPFS or HTTP)
     */
    function mintAgent(
        address to,
        string memory persona,
        string memory experience,
        string memory uri
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        string[] memory caps = new string[](5);
        caps[0] = "ANALYZE_MARKET";
        caps[1] = "GET_MARKETS";
        caps[2] = "EXECUTE_TRADE";
        caps[3] = "SCAN_ARBITRAGE";
        caps[4] = "GET_POSITIONS";

        agentMetadata[tokenId] = AgentMetadata({
            persona: persona,
            experience: experience,
            capabilities: caps,
            createdAt: block.timestamp,
            active: true
        });

        tradeStats[tokenId] = TradeStats({
            totalTrades: 0,
            successfulTrades: 0,
            totalVolume: 0,
            stateRoot: bytes32(0),
            lastUpdated: block.timestamp
        });

        emit AgentMinted(tokenId, to, persona);
        return tokenId;
    }

    /**
     * @notice Record a trade executed by the agent
     * @param tokenId The agent NFA token ID
     * @param success Whether the trade was successful
     * @param volume Trade volume in wei
     * @param newStateRoot Updated Merkle root of trade history
     */
    function recordTrade(
        uint256 tokenId,
        bool success,
        uint256 volume,
        bytes32 newStateRoot
    ) external onlyOwner {
        require(ownerOf(tokenId) != address(0), "Agent does not exist");

        TradeStats storage stats = tradeStats[tokenId];
        stats.totalTrades++;
        if (success) stats.successfulTrades++;
        stats.totalVolume += volume;
        stats.stateRoot = newStateRoot;
        stats.lastUpdated = block.timestamp;

        emit TradeRecorded(tokenId, stats.totalTrades, stats.successfulTrades, newStateRoot);
    }

    /**
     * @notice Update agent state key-value pair
     * @param tokenId The agent NFA token ID
     * @param key State key
     * @param value State value
     */
    function updateState(
        uint256 tokenId,
        string memory key,
        string memory value
    ) external onlyOwner {
        require(ownerOf(tokenId) != address(0), "Agent does not exist");
        agentState[tokenId][key] = value;
        emit AgentStateUpdated(tokenId, key, value);
    }

    /**
     * @notice Fund the agent with BNB
     * @param tokenId The agent NFA token ID
     */
    function fundAgent(uint256 tokenId) external payable {
        require(ownerOf(tokenId) != address(0), "Agent does not exist");
        require(msg.value > 0, "Must send BNB");
        emit AgentFunded(tokenId, msg.value);
    }

    // ═══ View Functions ═══

    /**
     * @notice Get agent's success rate as a percentage (0-100)
     */
    function getSuccessRate(uint256 tokenId) external view returns (uint256) {
        TradeStats memory stats = tradeStats[tokenId];
        if (stats.totalTrades == 0) return 0;
        return (stats.successfulTrades * 100) / stats.totalTrades;
    }

    /**
     * @notice Get agent's full stats
     */
    function getAgentStats(uint256 tokenId) external view returns (
        uint256 totalTrades,
        uint256 successfulTrades,
        uint256 totalVolume,
        bytes32 stateRoot,
        uint256 successRate
    ) {
        TradeStats memory stats = tradeStats[tokenId];
        uint256 rate = stats.totalTrades > 0
            ? (stats.successfulTrades * 100) / stats.totalTrades
            : 0;
        return (
            stats.totalTrades,
            stats.successfulTrades,
            stats.totalVolume,
            stats.stateRoot,
            rate
        );
    }

    /**
     * @notice Check if agent is active
     */
    function isActive(uint256 tokenId) external view returns (bool) {
        return agentMetadata[tokenId].active;
    }

    /**
     * @notice Get agent state value by key
     */
    function getState(uint256 tokenId, string memory key) external view returns (string memory) {
        return agentState[tokenId][key];
    }

    // ═══ ERC-8004 Identity Bridge ═══

    /**
     * @notice Link this NFA contract to an ERC-8004 identity registry agent
     * @param registry Address of the IdentityRegistry contract
     * @param agentId The ERC-8004 agent ID assigned to Flash
     */
    function linkToIdentityRegistry(address registry, uint256 agentId) external onlyOwner {
        identityRegistry = registry;
        erc8004AgentId = agentId;
        emit IdentityLinked(registry, agentId);
    }

    // ═══ Required Overrides ═══

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // Allow contract to receive BNB
    receive() external payable {}
}
