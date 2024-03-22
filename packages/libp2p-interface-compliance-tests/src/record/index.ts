import { expect } from 'aegir/utils/chai.js'
import type { TestSetup } from '../index.js'
import type { Record } from '@libp2p/interfaces/record'

export default (test: TestSetup<Record>) => {
  describe('record', () => {
    let record: Record

    beforeEach(async () => {
      record = await test.setup()
    })

    afterEach(async () => {
      await test.teardown()
    })

    it('has domain and codec', () => {
      expect(record.domain).to.exist()
      expect(record.codec).to.exist()
    })

    it('is able to marshal', () => {
      const rawData = record.marshal()
      expect(rawData).to.be.an.instanceof(Uint8Array)
    })

    it('is able to compare two records', () => {
      const equals = record.equals(record)
      expect(equals).to.eql(true)
    })
  })
}
