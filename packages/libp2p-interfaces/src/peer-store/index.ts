import type { PeerId } from '../peer-id/index.js'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { EventEmitter } from '../index.js'
import type { Envelope } from '../record/index.js'
import type { PeerData } from '../peer-data/index.js'

export interface Address {
  /**
   * Peer multiaddr
   */
  multiaddr: Multiaddr

  /**
   * Obtained from a signed peer record
   */
  isCertified: boolean
}

export interface AddressSorter {
  (ms: Address[]): Address[]
}

export interface Peer {
  /**
   * Peer's peer-id instance
   */
  id: PeerId

  /**
   * Peer's addresses containing its multiaddrs and metadata
   */
  addresses: Address[]

  /**
   * Peer's supported protocols
   */
  protocols: string[]

  /**
   * Peer's metadata map
   */
  metadata: Map<string, Uint8Array>

  /**
   * May be set if the key that this Peer has is an RSA key
   */
  pubKey?: Uint8Array

  /**
   * The last peer record envelope received
   */
  peerRecordEnvelope?: Uint8Array
}

export interface CertifiedRecord {
  raw: Uint8Array
  seqNumber: number
}

export interface AddressBookEntry {
  addresses: Address[]
  record: CertifiedRecord
}

export interface Book<Type> {
  /**
   * Get the known data of a peer
   */
  get: (peerId: PeerId) => Promise<Type>

  /**
   * Set the known data of a peer
   */
  set: (peerId: PeerId, data: Type) => Promise<void>

  /**
   * Remove the known data of a peer
   */
  delete: (peerId: PeerId) => Promise<void>
}

/**
 * AddressBook containing a map of peerIdStr to Address.
 */
export interface AddressBook {
  /**
   * ConsumePeerRecord adds addresses from a signed peer record contained in a record envelope.
   * This will return a boolean that indicates if the record was successfully processed and added
   * into the AddressBook
   */
  consumePeerRecord: (envelope: Envelope) => Promise<boolean>

  /**
   * Get the raw Envelope for a peer. Returns
   * undefined if no Envelope is found
   */
  getRawEnvelope: (peerId: PeerId) => Promise<Uint8Array | undefined>

  /**
   * Get an Envelope containing a PeerRecord for the given peer.
   * Returns undefined if no record exists.
   */
  getPeerRecord: (peerId: PeerId) => Promise<Envelope | undefined>

  /**
   * Add known addresses of a provided peer.
   * If the peer is not known, it is set with the given addresses.
   */
  add: (peerId: PeerId, multiaddrs: Multiaddr[]) => Promise<void>

  /**
   * Set the known addresses of a peer
   */
  set: (peerId: PeerId, data: Multiaddr[]) => Promise<void>

  /**
   * Return the known addresses of a peer
   */
  get: (peerId: PeerId) => Promise<Address[]>

  /**
   * Remove stored addresses of a peer
   */
  delete: (peerId: PeerId) => Promise<void>

  /**
   * Get the known multiaddrs for a given peer. All returned multiaddrs
   * will include the encapsulated `PeerId` of the peer.
   */
  getMultiaddrsForPeer: (peerId: PeerId, addressSorter?: AddressSorter) => Promise<Multiaddr[]>
}

/**
 * KeyBook containing a map of peerIdStr to their PeerId with public keys.
 */
export interface KeyBook {
  /**
   * Get the known data of a peer
   */
  get: (peerId: PeerId) => Promise<Uint8Array | undefined>

  /**
   * Set the known data of a peer
   */
  set: (peerId: PeerId, data: Uint8Array) => Promise<void>

  /**
   * Remove the known data of a peer
   */
  delete: (peerId: PeerId) => Promise<void>
}

/**
 * MetadataBook containing a map of peerIdStr to their metadata Map.
 */
export interface MetadataBook extends Book<Map<string, Uint8Array>> {
  /**
   * Set a specific metadata value
   */
  setValue: (peerId: PeerId, key: string, value: Uint8Array) => Promise<void>

  /**
   * Get specific metadata value, if it exists
   */
  getValue: (peerId: PeerId, key: string) => Promise<Uint8Array | undefined>

  /**
   * Deletes the provided peer metadata key from the book
   */
  deleteValue: (peerId: PeerId, key: string) => Promise<void>
}

/**
 * ProtoBook containing a map of peerIdStr to supported protocols.
 */
export interface ProtoBook extends Book<string[]> {
  /**
   * Adds known protocols of a provided peer.
   * If the peer was not known before, it will be added.
   */
  add: (peerId: PeerId, protocols: string[]) => Promise<void>

  /**
   * Removes known protocols of a provided peer.
   * If the protocols did not exist before, nothing will be done.
   */
  remove: (peerId: PeerId, protocols: string[]) => Promise<void>
}

export interface PeerProtocolsChangeData {
  peerId: PeerId
  protocols: string[]
}

export interface PeerMultiaddrsChangeData {
  peerId: PeerId
  multiaddrs: Multiaddr[]
}

export interface PeerPublicKeyChangeData {
  peerId: PeerId
  pubKey?: Uint8Array
}

export interface PeerMetadataChangeData {
  peerId: PeerId
  metadata: Map<string, Uint8Array>
}

export type EventName = 'peer' | 'change:protocols' | 'change:multiaddrs' | 'change:pubkey' | 'change:metadata'

export interface PeerStoreEvents {
  'peer': CustomEvent<PeerData>
  'change:protocols': CustomEvent<PeerProtocolsChangeData>
  'change:multiaddrs': CustomEvent<PeerMultiaddrsChangeData>
  'change:pubkey': CustomEvent<PeerPublicKeyChangeData>
  'change:metadata': CustomEvent<PeerMetadataChangeData>
}

export interface PeerStore extends EventEmitter<PeerStoreEvents> {
  addressBook: AddressBook
  keyBook: KeyBook
  metadataBook: MetadataBook
  protoBook: ProtoBook

  getPeers: () => AsyncIterable<Peer>
  delete: (peerId: PeerId) => Promise<void>
  has: (peerId: PeerId) => Promise<boolean>
  get: (peerId: PeerId) => Promise<Peer>
}
