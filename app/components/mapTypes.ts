// Shape of a map object. The campus map is hardcoded in dashboard/page.tsx; this type is only
// used to describe the buildings/rooms handed to the "nearest extinguisher" ranking.
export type MapObject = {
  map_object_id: number
  object_type: 'building' | 'room' | 'tree_area' | 'wall' | 'gate' | 'safe_zone' | 'area'
  name: string
  color: string
  x: number
  y: number
  width: number
  height: number
  parent_id: number | null
  parent_name?: string | null
  floor?: string | null
  pin_x?: number | null
  pin_y?: number | null
}
