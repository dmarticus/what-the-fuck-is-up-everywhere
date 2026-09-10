export type SceneId = 'diner' | 'office' | 'city' | 'gym' | 'space' | 'crowd' | 'chat'
export type SceneChoice = 'auto' | SceneId
export type Shape = 'classic' | 'square' | 'wide'

export interface Scene {
  id: SceneId
  name: string
  symbol: string
  color: string
  terms: RegExp
}

export const scenes: Scene[] = [
  { id: 'diner', name: 'Diner', symbol: '☕', color: '#b98459', terms: /\b(denny'?s?|diner|restaurant|waffle|breakfast|pancake|cafe|coffee|kitchen|chef|cook|ihop)\b/i },
  { id: 'office', name: 'Office', symbol: '▤', color: '#799e92', terms: /\b(office|work|coworkers?|colleagues?|engineers?|developers?|devs?|posthog|standup|stand-up|accountants?|hr|zoom|slack|boardroom|boss|startup)\b/i },
  { id: 'chat', name: 'Group chat', symbol: '✉', color: '#a997cf', terms: /\b(chat|discord|friends?|besties|family|homies|whatsapp|gamers?|gaming|squad|roommates?)\b/i },
  { id: 'gym', name: 'Gym', symbol: '↔', color: '#abbb6f', terms: /\b(gym|fitness|workout|lifters?|crossfit|athletes?|runners?|pilates|yoga|leg day)\b/i },
  { id: 'space', name: 'Space', symbol: '✦', color: '#888dd2', terms: /\b(space|moon|mars|aliens?|astronauts?|saturn|jupiter|galaxy|universe|nasa)\b/i },
  { id: 'city', name: 'City', symbol: '▥', color: '#d3947e', terms: /\b(new york|nyc|brooklyn|london|tokyo|paris|berlin|chicago|boston|seattle|austin|san francisco|los angeles|sydney|toronto|city|downtown|neighbou?rhood|street|town)\b/i },
  { id: 'crowd', name: 'Crowd', symbol: '⚑', color: '#c3919f', terms: /\b(crowd|party|wedding|school|class|students?|concert|festival|mosh|metal|punks?|everyone|people|team|club)\b/i },
]

export function matchScene(address: string): { scene: Scene; matched: boolean } {
  const scene = scenes.find((candidate) => candidate.terms.test(address))
  return { scene: scene ?? scenes[6], matched: Boolean(scene) }
}

export function getScene(address: string, choice: SceneChoice): Scene {
  return choice === 'auto' ? matchScene(address).scene : scenes.find((scene) => scene.id === choice)!
}

export function dimensions(shape: Shape): { width: number; height: number } {
  return { width: 640, height: shape === 'square' ? 640 : shape === 'wide' ? 360 : 480 }
}

export function cleanAddress(value: string): string {
  return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 60).join('')
}
