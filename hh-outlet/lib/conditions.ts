// The conditions the owner picks from. Each maps to an eBay condition id; eBay allows only some conditions in each
// category, so the publish step checks the category's policy before sending one (lib/ebay/publish.ts).
export const conditions = [
  { value: 'New', ebay: 'NEW', help: 'Sealed or unused, in the original packaging' },
  { value: 'New, open box', ebay: 'NEW_OTHER', help: 'Unused, box opened or missing' },
  { value: 'New, damaged packaging', ebay: 'NEW_OTHER', help: 'Unused, box is damaged' },
  { value: 'Like new', ebay: 'LIKE_NEW', help: 'Used very little, no visible wear' },
  { value: 'Used, good', ebay: 'USED_GOOD', help: 'Works, light signs of use' },
  { value: 'Used, fair', ebay: 'USED_ACCEPTABLE', help: 'Works, clear signs of use' },
  { value: 'For parts or repair', ebay: 'FOR_PARTS_OR_NOT_WORKING', help: 'Does not work or is incomplete' },
] as const;

export type Condition = (typeof conditions)[number]['value'];
export const isCondition = (v: unknown): v is Condition => conditions.some((c) => c.value === v);

export const testedLabels = { works: 'Tested, works', not_working: 'Tested, does not work', untested: 'Not tested' } as const;
export const packagingLabels = { original: 'Original packaging', damaged: 'Packaging damaged', none: 'No packaging' } as const;
