import { Block } from '@/components/ui/Block'
import { WalletTransfer } from '@/contracts/utils/HighloadWalletTypes'
import { SignCell } from '@/contracts/utils/SignExternalMessage'
import { useLiteclient } from '@/store/liteClient'
import { useEffect, useState } from 'react'
import { Address, beginCell, Cell, storeMessage } from '@ton/core'
import { ITonHighloadWalletV2 } from '@/types'
import { getPasswordInteractive, decryptWalletData, usePassword } from '@/store/passwordManager'
import { textToWalletBody } from '@/utils/textToWalletBody'
import { secretKeyToED25519 } from '@/utils/ed25519'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { parseTon } from '@/utils/units'

export default function SendTon({ wallet }: { wallet: ITonHighloadWalletV2 }) {
  const [amount, setAmount] = useState('0')
  const [recepient, setRecepient] = useState('')
  const [message, setMessage] = useState('')
  const [stateInit, setStateInit] = useState('')
  const [message64, setMessage64] = useState(false)

  const liteClient = useLiteclient()

  useEffect(() => {
    setAmount('0')
    setRecepient('')
    setMessage('')
    setStateInit('')
    setMessage64(false)
  }, [wallet, liteClient])

  return (
    <Block className="flex flex-col">
      <div className="font-medium text-lg">Send TON:</div>

      <div className="mt-2 flex flex-col">
        <label htmlFor="toInput">Recepient:</label>
        <Input
          className="border rounded p-2"
          id="toInput"
          type="text"
          value={recepient}
          onChange={(e: any) => setRecepient(e.target.value)}
        />
      </div>

      <div className="mt-2 flex flex-col">
        <label htmlFor="amountInput">Amount:</label>
        <Input
          className="border rounded p-2"
          id="amountInput"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={amount}
          onChange={(e: any) => setAmount(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="mt-2 flex flex-col">
        <label htmlFor="messageInput">Message:</label>
        <div className="flex items-center">
          <label htmlFor="base64Check" className="text-sm text-foreground/75 my-1 cursor-pointer">
            Base64 cell?
          </label>
          <Checkbox
            id="base64Check"
            checked={message64}
            onCheckedChange={(e: any) => {
              console.log('change', e)
              setMessage64((c) => !c)
            }}
            className="ml-2"
          />
        </div>
        <Input
          className="border rounded p-2"
          id="messageInput"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={message}
          onChange={(e: any) => setMessage(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="mt-2 flex flex-col">
        <label htmlFor="amountInput">StateInit:</label>
        <p className="text-foreground/75 text-sm my-1">Base64 encoded state init cell</p>
        <Input
          className="border rounded p-2"
          id="amountInput"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={stateInit}
          onChange={(e: any) => setStateInit(e.target.value)}
          autoComplete="off"
        />
      </div>

      <SendModal
        amount={amount}
        recepient={recepient}
        wallet={wallet}
        message={message}
        stateInit={stateInit}
        isBase64={message64}
      />
    </Block>
  )
}

const SendModal = ({
  amount,
  recepient,
  wallet,
  message: sendMessage,
  isBase64,
  stateInit,
}: {
  amount: string
  recepient: string
  wallet: ITonHighloadWalletV2
  message: string
  stateInit: string
  isBase64: boolean
}) => {
  const liteClient = useLiteclient()

  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  const [status, setStatus] = useState(0) // 0 before send, 1 sending, 2 success, 3 error
  const [seconds, setSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const passwordState = usePassword()

  const clearPopup = () => {
    setStatus(0)
    setSeconds(0)
    setMessage('')
  }
  useEffect(() => {
    clearPopup()
  }, [])

  const clickOpenModal = async (e) => {
    if (e) {
      e.preventDefault()
    }

    const password = await getPasswordInteractive()
    if (password) {
      setOpen(true)
    }
  }

  const sendMoney = async () => {
    const params: WalletTransfer = {
      destination: Address.parse(recepient),
      amount: parseTon(amount),
      mode: 3,
      body: textToWalletBody(sendMessage, isBase64),
    }

    if (stateInit) {
      const parsed = Cell.fromBoc(Buffer.from(stateInit, 'base64'))[0] // TonWeb.boc.Cell.oneFromBoc(TonWeb.utils.base64ToBytes(stateInit))
      if (parsed) {
        params.state = parsed
      }
    }

    try {
      const password = passwordState.password.get()

      if (!password) {
        throw new Error(`Invalid password`)
      }

      const decrypted = await decryptWalletData(password, wallet.key)
      const keyPair = secretKeyToED25519(decrypted.seed || Buffer.from([]))
      if (keyPair.secretKey.length === 32) {
        keyPair.secretKey = Buffer.concat([
          Uint8Array.from(keyPair.secretKey),
          Uint8Array.from(keyPair.publicKey),
        ])
      }
      const message = wallet.wallet.CreateTransferMessage([params])
      const signedBody = SignCell(keyPair.secretKey, message.body)
      message.body = signedBody

      const payload = beginCell().store(storeMessage(message)).endCell()
      const result = await liteClient.sendMessage(payload.toBoc())

      console.log('result:', result)
      if (result.status !== 1) {
        setStatus(3)
        setMessage(`Error occured. Code: ${result.status}. Message:`)
        return
      }
    } catch (e) {
      setStatus(3)
      if (e instanceof Error) {
        setMessage('Error occured: ' + e.message)
      } else {
        setMessage('Unknown Error occured')
      }
      return
    }

    setStatus(2)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full mt-2" onClick={clickOpenModal}>
            Send
          </Button>
        </DialogTrigger>
        <DialogContent>
          {status === 0 && (
            <>
              <DialogHeader>
                <DialogTitle>
                  You will send {amount} TON to {recepient}.
                </DialogTitle>
                <DialogDescription></DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant={'default'} onClick={() => sendMoney()}>
                  Confirm
                </Button>
                <Button variant={'outline'} onClick={() => close()} className="ml-2">
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}

          {status === 1 && <div>Sending {seconds}</div>}
          {status === 2 && (
            <div>
              <div>Success</div>
              <Button className="mt-8" onClick={() => close()}>
                Close
              </Button>
            </div>
          )}
          {status === 3 && (
            <div>
              <div>Error: {message}</div>
              <Button className="mt-8" onClick={() => close()}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* <BlueButton className="mt-2" onClick={clickOpenModal}>
        Send
      </BlueButton>

      <Popup
        onOpen={clearPopup}
        onClose={() => {
          setOpen(false)
          clearPopup()
        }}
        open={open}
        closeOnDocumentClick
        modal
      >
        <div className="p-4">
          {status === 0 && (
            <div className="flex flex-col">
              <div>
                You will send {amount} TON to {recepient}.
              </div>
              <div className="mt-4">Are you sure?</div>
              <div className="flex mt-2">
                <BlueButton onClick={() => sendMoney()}>Yes</BlueButton>
                <BlueButton onClick={() => close()} className="ml-2">
                  Cancel
                </BlueButton>
              </div>
            </div>
          )}
          {status === 1 && <div>Sending {seconds}</div>}
          {status === 2 && (
            <div>
              <div>Success</div>
              <BlueButton className="mt-8" onClick={() => close()}>
                Close
              </BlueButton>
            </div>
          )}
          {status === 3 && (
            <div>
              <div>Error: {message}</div>
              <BlueButton className="mt-8" onClick={() => close()}>
                Close
              </BlueButton>
            </div>
          )}
        </div>
      </Popup> */}
    </>
  )
}
