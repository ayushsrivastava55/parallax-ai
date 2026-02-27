/**
 * Human-readable ABI fragments for ERC-8004 contracts (ethers v6 format).
 * Matches the official ERC-8004 reference implementation interfaces.
 */

export const IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) returns (uint256)",
  "function register(string agentURI, tuple(string metadataKey, bytes metadataValue)[] metadata) returns (uint256)",
  "function register() returns (uint256)",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function unsetAgentWallet(uint256 agentId)",
  "function isAuthorizedOrOwner(address spender, uint256 agentId) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
] as const;

export const REPUTATION_REGISTRY_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function revokeFeedback(uint256 agentId, uint64 feedbackIndex)",
  "function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
  "function getClients(uint256 agentId) view returns (address[])",
  "function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)",
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)",
] as const;

export const VALIDATION_REGISTRY_ABI = [
  "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)",
  "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
  "function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
  "function getSummary(uint256 agentId, address[] validatorAddresses, string tag) view returns (uint64 count, uint8 avgResponse)",
  "function getAgentValidations(uint256 agentId) view returns (bytes32[])",
  "function getValidatorRequests(address validatorAddress) view returns (bytes32[])",
  "event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)",
  "event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
] as const;

export const FLASH_AGENT_ABI = [
  "function getAgentStats(uint256 tokenId) view returns (uint256 totalTrades, uint256 successfulTrades, uint256 totalVolume, bytes32 stateRoot, uint256 successRate)",
  "function isActive(uint256 tokenId) view returns (bool)",
  "function getSuccessRate(uint256 tokenId) view returns (uint256)",
  "function getState(uint256 tokenId, string key) view returns (string)",
  "function identityRegistry() view returns (address)",
  "function erc8004AgentId() view returns (uint256)",
] as const;
