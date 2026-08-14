import WorldGroup from '@/world/world'
import WorldState from './utils/worldState'
import { GroupBaseEntity } from '@/types/groupBase/entity'
import { GroupBaseData } from '@/types/groupBase/index.d'
import { BaseEntityClass } from '@/types/baseEntity'
import { BaseObjData } from '@/types/map2d'

declare global {
  interface Window {
    runAction: (key: string) => void,
    stopRunningAction: (key: string) => void,
  }
}
