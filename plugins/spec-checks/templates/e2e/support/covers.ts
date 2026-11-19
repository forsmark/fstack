/**
 * The annotations that name the scenarios a Playwright test covers, each as
 * `<capability> › <requirement> › <scenario>`. The coverage check reads them
 * from the source, so write the keys as literal strings:
 *
 *   test('a member renews a loan', { annotation: covers('loans › A loan is renewed once › Renewed') }, async ({ page }) => { … })
 */
export function covers(...scenarios: string[]): { type: string; description: string }[] {
  return scenarios.map((description) => ({ type: 'covers', description }));
}
