# libp2p-peer-map <!-- omit in toc -->

> store values against peer ids

## Table of Contents <!-- omit in toc -->

- [Description](#description)
- [Example](#example)
- [Installation](#installation)
- [License](#license)
  - [Contribution](#contribution)

## Description

 We can't use PeerIds as map keys because map keys are compared using same-value-zero equality, so this is just a map that stringifies the PeerIds before storing them.

 PeerIds cache stringified versions of themselves so this should be a cheap operation.

## Example

```JavaScript
import { peerMap } from '@libp2p/peer-map'

const map = peerMap<string>()

map.set(peerId, 'value')
```

## Installation

```console
$ npm i @libp2p/peer-map
```

## License

Licensed under either of

 * Apache 2.0, ([LICENSE-APACHE](LICENSE-APACHE) / http://www.apache.org/licenses/LICENSE-2.0)
 * MIT ([LICENSE-MIT](LICENSE-MIT) / http://opensource.org/licenses/MIT)

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
