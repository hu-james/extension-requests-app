import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Automatically unmount and clean up DOM after every test
afterEach(() => {
  cleanup()
})
