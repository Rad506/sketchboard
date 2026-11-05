import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { showUpdateBar } from './ui/updateBar'

const updateSW = registerSW({
  onNeedRefresh: () => showUpdateBar(() => updateSW(true)),
})
