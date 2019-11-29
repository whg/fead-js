import EventEmitter from 'events'
import * as serial from './serial'

const SEPARATOR = ':'

const RECEIVE_TIMEOUT = 12
const REQUEST_TIME_SPACE = 2

export type packet = string
export type param = number

export const Param = {
  ADDRESS: 254,
  UID: 255
}

export const enum Method {
  GET = 'g',
  SET = 's'
}

export type Request = {
  method: Method;
  param: param;
  address: number;
  value?: number;
  extraValue?: number;
}

export type Response = {
  address: number;
  param: param;
  value: number;
  extraValue?: number;
}

const eventEmitter = new EventEmitter()
eventEmitter.setMaxListeners(Infinity)
const requestQueue: Request[] = []

export function begin(device: { path: string; baudRate: number }): Promise<void> {
  return serial.open(device)
}

export function construct(request: Request): packet {
  const { method, param, address } = request
  let output = `${method}${address}${SEPARATOR}${param}`
  if (request.value !== undefined) {
    output += `${SEPARATOR}${request.value}`
  }
  if (request.extraValue !== undefined) {
    output += `${SEPARATOR}${request.extraValue}`
  }
  return output + '\n'
}

export function unpack(response: packet): Response {
  const [address, param, ...values] = response
    .substr(1)
    .split(SEPARATOR)
    .map(p => parseInt(p))

  const output: Response = {
    address,
    param,
    value: values[0]
  }

  if (values.length > 1) {
    output.extraValue = values[1]
  }

  return output
}

function _send(req: Request): Promise<Response> {
  return new Promise((resolve: (r: Response) => void, reject: () => void) => {
    serial.write(construct(req))
    const timeout = setTimeout(reject, RECEIVE_TIMEOUT)
    serial.setReceivedCallback((packet: packet) => {
      clearTimeout(timeout)
      resolve(unpack(packet))
    })
  })
}

function requestComplete(): Promise<void> {
  return new Promise((resolve: () => void) => {
    eventEmitter.once('response', () => {
      setTimeout(resolve, REQUEST_TIME_SPACE)
    })
  })
}

async function send(request: Request, maxAttempts = 2): Promise<Response> {
  requestQueue.push(request)

  while (requestQueue[0] !== request) {
    await requestComplete()
  }

  const finish = (): void => {
    requestQueue.shift()
    eventEmitter.emit('response', request)
  }

  let attempts = 0
  while (attempts < maxAttempts) {
    try {
      const response = await _send(request)
      finish()
      return response
    } catch (e) {
      attempts++
    }
  }

  finish()
  throw new Error('no response')
}

export function get(address: number, param: param, extraValue?: number): Promise<Response> {
  return send({ method: Method.GET, address, param, extraValue })
}

export function set(address: number, param: param, value: number, extraValue?: number): Promise<Response> {
  return send({ method: Method.SET, address, param, value, extraValue })
}

export function * availableAddresses(): IterableIterator<number> {
  for (let i = 1; i < 20; i++) yield i
  for (let i = 100; i < 110; i++) yield i
}

export async function findOnline(): Promise<Slave[]> {
  const output: Slave[] = []
  for (const address of availableAddresses()) {
    try {
      const response = await get(address, Param.UID)
      const slave = new Slave(address, response.value)
      output.push(slave)
    } catch (e) {}
  }
  return output
}
