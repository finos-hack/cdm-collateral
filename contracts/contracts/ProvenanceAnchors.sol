// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Provenance anchors
/// @notice Anchors the hash of a token's provenance link record (task-document-provenance, wp-adr-document-provenance):
/// the issuance record, token terms, custody record, constitution or valuation, each a W3C PROV-O JSON-LD record kept
/// off the ledger and hashed (keccak-256) over its JCS canonical form. Agreements between two parties are anchored in
/// CollateralControl and TripartySettlement; this contract covers the documents that belong to a token, not a pair.
/// Each event is read into a cdm-ext LedgerAnchor of kind AssetDocument or Valuation (cdmHash = the record hash).
///
/// One chain of revisions per link: a link's first record names revisionOf 0; a later record names the hash of the
/// record it replaces, which must be the link's current head, so two records cannot both replace the same version.
/// The contract does not decide who may speak for a link: any account may anchor, and the record keeper's authority
/// comes from its Verifiable Credential over the record, which the services verify.
contract ProvenanceAnchors {
    // linkId (keccak256 of the link record's JSON-LD id) => hash of its current record; 0 before the first
    mapping(bytes32 => bytes32) public head;

    event ProvenanceAnchored(address indexed token, bytes32 indexed linkId, bytes32 cdmHash, bytes32 revisionOf,
        address indexed anchoredBy);

    error ZeroHash();
    error NotHead(bytes32 linkId, bytes32 current, bytes32 revisionOf);

    function anchor(address token, bytes32 linkId, bytes32 cdmHash, bytes32 revisionOf) external {
        if (cdmHash == bytes32(0)) revert ZeroHash();
        bytes32 current = head[linkId];
        if (current != revisionOf) revert NotHead(linkId, current, revisionOf);
        head[linkId] = cdmHash;
        emit ProvenanceAnchored(token, linkId, cdmHash, revisionOf, msg.sender);
    }
}
