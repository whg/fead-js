import EventEmitter from 'events'
import { Gpio } from 'onoff'
import * as serial from './serial'
import { Client } from './Client'
import { NoResponseError } from './errors'
import { flash } from './flash'

const SEPARATOR = ':'

const broadcastAddress = 0

export type packet = string
export type param = number
type method = string

let piPowerPin: null | Gpio = null
try {
  piPowerPin = new Gpio(10, 'out')
} catch (e) {}

export const Param = {
  UID: 255,
  ADDRESS: 254,
  DISCOVER: 253,
  VERSION: 252,
  RESET: 251
}

export const Method = {
  GET: 'g',
  SET: 's'
}

export type Request = {
  method: method;
  param: param;
  address?: number;
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
    .map(p => parseFloat(p))

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

export function write(req: Request): void {
  serial.write(construct(req))
}

export function writeAndWait(req: Request, timeout = 12): Promise<Response> {
  return new Promise((resolve: (r: Response) => void, reject: () => void) => {
	const _timeout = setTimeout(() => {
	  setTimeout(reject, 100)
	}, timeout)

    serial.setReceivedCallback((packet: packet) => {
      clearTimeout(_timeout)
      const response = unpack(packet)
      if (response.param === req.param && response.address === req.address) {
        resolve(response)
      } else {
        reject()
      }
    })
    write(req)
  })
}

function requestComplete(nextRequestDelay = 20): Promise<void> {
  return new Promise((resolve: () => void) => {
    eventEmitter.once('response', () => {
      setTimeout(resolve, nextRequestDelay)
    })
  })
}

export async function send(request: Request, maxAttempts = 3, timeout = 250): Promise<Response> {
  requestQueue.push(request)

  while (requestQueue[0] !== request) {
    await requestComplete()
  }

  const finish = (): void => {
    requestQueue.shift()
    eventEmitter.emit('response', request)
  }

  let attempts = 1
  while (attempts <= maxAttempts) {
    try {
      const response = await writeAndWait(request, timeout * attempts)
      finish()
      await new Promise((res) => setTimeout(res, 5))
      return response
    } catch (e) {
      attempts++
    }
  }

  finish()
  throw new NoResponseError(`tried ${maxAttempts} and no response`)
}

export function get(address: number, param: param, extraValue?: number): Promise<Response> {
  return send({ method: Method.GET, address, param, extraValue })
}

export function set(address: number, param: param, value: number, extraValue?: number): Promise<Response> {
  return send({ method: Method.SET, address, param, value, extraValue })
}

export async function broadcast(request: Request, callback: (res: Response) => void, timeout = 500): Promise<void> {
  requestQueue.push(request)

  while (requestQueue[0] !== request) {
    await requestComplete()
  }

  request.address = broadcastAddress
  serial.pushUnsolicitedReceiverCallback((line: packet) => {
    callback(unpack(line))
  })
  write(request)

  return new Promise((resolve) => {
    setTimeout(() => {
      serial.popUnsolicitedReceiverCallback()
      requestQueue.shift()
      eventEmitter.emit('response', request)
      resolve()
    }, timeout)
  })
}

async function writeAndExpectReply(line: string, timeout = 20): Promise<boolean> {
  let replied = false
  serial.setReceivedCallback(() => replied = true)
  serial.write(line)
  await new Promise(resolve => setTimeout(resolve, timeout))
  return replied
}

export function power(on = true) {
  const v = on ? 1 : 0
  if (piPowerPin) {
    piPowerPin.write(v)
  }
  return writeAndExpectReply(`p${v}\n`)
}

export async function version(): Promise<boolean> {
  return writeAndExpectReply('v\n')
}

async function broadcastGet(param: param): Promise<Client[]> {
  const output: Client[] = []
  await broadcast({
    method: Method.GET,
    param,
  }, (response: Response) => {
    const { address, value } = response
    output.push(new Client(address, value))
  })
  return output
}

export const findOnline = () => broadcastGet(Param.ADDRESS)
export const discover = () => broadcastGet(Param.DISCOVER)

export async function resetGroup(group: number): Promise<void> {
  return broadcast({
    method: Method.SET,
    param: Param.RESET,
    value: group
  }, () => {})
}

export async function flashGroup(group: number, binaryFilepath: string): Promise<void> {
  await resetGroup(group)
  await new Promise(resolve => setTimeout(resolve, 100))
  await flash(binaryFilepath)
}
