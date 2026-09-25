/** Newer cards write conditions with icon tokens: {{ICN:YEL}} & {{ICN:ChaTag}}GT. Make them readable. */
export function prettyAbility(t: string): string {
  return t
    .replace(/\{\{ICN:(RED|YEL|PUR|GRN|BLU|LGT)\}\}/g, '$1')
    .replace(/\{\{ICN:Epi\}\}/g, 'Episode: ')
    .replace(/\{\{ICN:(ChaTag|Chara)\}\}/g, '')
    .replace(/\{\{ICN:[^}]+\}\}/g, '');
}
