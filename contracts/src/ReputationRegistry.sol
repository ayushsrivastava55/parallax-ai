// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReputationRegistry — ERC-8004 Agent Reputation
 * @notice Stores feedback signals from clients about registered agents.
 * @dev Follows the ERC-8004 reference implementation interface.
 *      Non-upgradeable (hackathon scope). Feedback is 1-indexed per spec.
 *      Struct fields match spec: no client/timestamp stored on-chain (emitted only).
 */

interface IIdentityRegistryReputation {
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
}

contract ReputationRegistry {
    int128 private constant MAX_ABS_VALUE = 1e38;

    // ═══ Events (matches ERC-8004 spec) ═══
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash);

    // ═══ Structs (matches ERC-8004 spec — no client/timestamp stored) ═══
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bool isRevoked;
        string tag1;
        string tag2;
    }

    // ═══ State ═══
    address public immutable identityRegistry;

    // agentId => clientAddress => feedbackIndex => Feedback (1-indexed)
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;
    // agentId => clientAddress => last feedback index
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;
    // agentId => list of unique clients
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _clientExists;

    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "bad identity");
        identityRegistry = _identityRegistry;
    }

    // ═══ Feedback ═══

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(valueDecimals <= 18, "too many decimals");
        require(value >= -MAX_ABS_VALUE && value <= MAX_ABS_VALUE, "value too large");

        // Prevent self-feedback from owner/operators (spec requirement)
        require(
            !IIdentityRegistryReputation(identityRegistry).isAuthorizedOrOwner(msg.sender, agentId),
            "Self-feedback not allowed"
        );

        // Increment and get current index (1-indexed per spec)
        uint64 currentIndex = ++_lastIndex[agentId][msg.sender];

        _feedback[agentId][msg.sender][currentIndex] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false
        });

        if (!_clientExists[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _clientExists[agentId][msg.sender] = true;
        }

        emit NewFeedback(agentId, msg.sender, currentIndex, value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][msg.sender], "index out of bounds");
        require(!_feedback[agentId][msg.sender][feedbackIndex].isRevoked, "Already revoked");

        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        require(feedbackIndex > 0, "index must be > 0");
        require(bytes(responseURI).length > 0, "Empty URI");
        require(feedbackIndex <= _lastIndex[agentId][clientAddress], "index out of bounds");

        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    // ═══ Views ═══

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }

    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked) {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][clientAddress], "index out of bounds");
        Feedback storage f = _feedback[agentId][clientAddress][feedbackIndex];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }

    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        // Spec: clientAddresses required for gas safety
        address[] memory clientList;
        if (clientAddresses.length > 0) {
            clientList = _copyCalldata(clientAddresses);
        } else {
            clientList = _clients[agentId];
        }

        return _computeSummary(agentId, clientList, tag1, tag2);
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    // ═══ Internal ═══

    function _copyCalldata(address[] calldata arr) private pure returns (address[] memory out) {
        out = new address[](arr.length);
        for (uint256 i; i < arr.length; i++) out[i] = arr[i];
    }

    function _computeSummary(
        uint256 agentId,
        address[] memory clientList,
        string calldata tag1,
        string calldata tag2
    ) private view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        bytes32 emptyHash = keccak256(bytes(""));
        bytes32 tag1Hash = keccak256(bytes(tag1));
        bytes32 tag2Hash = keccak256(bytes(tag2));

        int256 sum;
        uint64[19] memory decimalCounts;

        for (uint256 i; i < clientList.length; i++) {
            uint64 lastIdx = _lastIndex[agentId][clientList[i]];
            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = _feedback[agentId][clientList[i]][j];
                if (fb.isRevoked) continue;
                if (emptyHash != tag1Hash && tag1Hash != keccak256(bytes(fb.tag1))) continue;
                if (emptyHash != tag2Hash && tag2Hash != keccak256(bytes(fb.tag2))) continue;

                int256 factor = int256(10 ** uint256(18 - fb.valueDecimals));
                sum += fb.value * factor;
                decimalCounts[fb.valueDecimals]++;
                count++;
            }
        }

        if (count == 0) return (0, 0, 0);

        // Find mode (most frequent valueDecimals)
        uint8 modeDecimals;
        uint64 maxCount;
        for (uint8 d; d <= 18; d++) {
            if (decimalCounts[d] > maxCount) {
                maxCount = decimalCounts[d];
                modeDecimals = d;
            }
        }

        int256 avgWad = sum / int256(uint256(count));
        summaryValue = int128(avgWad / int256(10 ** uint256(18 - modeDecimals)));
        summaryValueDecimals = modeDecimals;
    }
}
