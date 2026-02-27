// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title IdentityRegistry — ERC-8004 Agent Identity
 * @notice Non-upgradeable ERC-721 registry for AI agent identity with metadata and EIP-712 wallet.
 * @dev Follows the ERC-8004 reference implementation interface.
 *      Uses regular constructor instead of UUPS proxy (hackathon scope).
 *      Struct field names match spec: metadataKey / metadataValue.
 *      agentWallet is stored as reserved metadata key (auto-set on register).
 */
contract IdentityRegistry is ERC721, ERC721URIStorage, EIP712 {
    using ECDSA for bytes32;

    // ═══ Structs (matches ERC-8004 spec) ═══
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    // ═══ State ═══
    uint256 private _lastId;
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // ═══ Constants ═══
    bytes32 private constant AGENT_WALLET_SET_TYPEHASH =
        keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)");
    bytes32 private constant RESERVED_AGENT_WALLET_KEY_HASH = keccak256("agentWallet");

    // ═══ Events (matches ERC-8004 spec) ═══
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    constructor()
        ERC721("AgentIdentity", "AGENT")
        EIP712("ERC8004IdentityRegistry", "1")
    {}

    // ═══ Registration ═══

    function register() external returns (uint256 agentId) {
        agentId = _lastId++;
        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        emit Registered(agentId, "", msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));
    }

    function register(string memory agentURI) external returns (uint256 agentId) {
        agentId = _lastId++;
        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        emit Registered(agentId, agentURI, msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));
    }

    function register(string memory agentURI, MetadataEntry[] memory metadata) external returns (uint256 agentId) {
        agentId = _lastId++;
        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        emit Registered(agentId, agentURI, msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));

        for (uint256 i; i < metadata.length; i++) {
            require(keccak256(bytes(metadata[i].metadataKey)) != RESERVED_AGENT_WALLET_KEY_HASH, "reserved key");
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(agentId, metadata[i].metadataKey, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    // ═══ Metadata ═══

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][metadataKey];
    }

    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external {
        require(
            msg.sender == ownerOf(agentId) ||
            isApprovedForAll(ownerOf(agentId), msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        require(keccak256(bytes(metadataKey)) != RESERVED_AGENT_WALLET_KEY_HASH, "reserved key");
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    // ═══ Agent Wallet (EIP-712 verified, spec-compliant) ═══

    function getAgentWallet(uint256 agentId) external view returns (address) {
        bytes memory walletData = _metadata[agentId]["agentWallet"];
        if (walletData.length == 0) return address(0);
        return address(bytes20(walletData));
    }

    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external {
        address _owner = ownerOf(agentId);
        require(
            msg.sender == _owner ||
            isApprovedForAll(_owner, msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        require(newWallet != address(0), "bad wallet");
        require(block.timestamp <= deadline, "expired");

        bytes32 structHash = keccak256(abi.encode(AGENT_WALLET_SET_TYPEHASH, agentId, newWallet, _owner, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        require(err == ECDSA.RecoverError.NoError && recovered == newWallet, "invalid wallet sig");

        _metadata[agentId]["agentWallet"] = abi.encodePacked(newWallet);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(newWallet));
    }

    function unsetAgentWallet(uint256 agentId) external {
        address _owner = ownerOf(agentId);
        require(
            msg.sender == _owner ||
            isApprovedForAll(_owner, msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        _metadata[agentId]["agentWallet"] = "";
        emit MetadataSet(agentId, "agentWallet", "agentWallet", "");
    }

    // ═══ URI Management ═══

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        address _owner = ownerOf(agentId);
        require(
            msg.sender == _owner ||
            isApprovedForAll(_owner, msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    // ═══ Utility ═══

    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool) {
        address _owner = ownerOf(agentId);
        return _isAuthorized(_owner, spender, agentId);
    }

    // ═══ Required Overrides ═══

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
