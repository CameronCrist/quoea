import type { CID } from 'multiformats/cid'
import type { AbortOptions } from '../index'
import type { PeerData } from '../peer-data'

export interface ContentRoutingFactory {
  new (options?: any): ContentRouting
}

export interface ContentRouting {
  provide: (cid: CID, options: AbortOptions) => Promise<void>
  findProviders: (cid: CID, options: AbortOptions) => AsyncIterable<PeerData>
}

export default ContentRouting
