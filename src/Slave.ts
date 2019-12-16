import * as fead from './fead'

export const online = (slave: Slave): boolean => slave.uid !== undefined

export class Slave {
  constructor(public address: number, public uid?: number) {}

  isOnline(): Promise<boolean> {
    return new Promise((resolve) => {
      if (online(this)) {
        resolve(true)
      } else if (this.address) {
        fead.get(this.address, fead.Param.UID)
          .then((response) => {
            this.uid = response.value
            resolve(true)
          })
          .catch(() => resolve(false))
      } else {
        resolve(false)
      }
    })
  }
}
