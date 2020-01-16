export * from './fead'
export { Vocab, fromHeader as vocabFromHeader } from './vocab'
export { setUnsolicitedReceiverCallback, useLogger } from './serial'
export { Slave, online } from './Slave'
export { NoResponseError } from './errors'

export const vocab = { UID: 255, Address: 254 }
