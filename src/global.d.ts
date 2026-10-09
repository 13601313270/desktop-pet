declare global {
  interface Window {
    runAction: (key: string) => void,
    stopRunningAction: (key: string) => void,
  }
}

export {}
