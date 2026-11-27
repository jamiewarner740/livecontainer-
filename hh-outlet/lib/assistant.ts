import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { conditions } from './conditions';
import { categories } from './store';

// Photo-to-listing helper. The owner photographs an item (and its box or label) and can add a short spoken or typed
// note. Claude reads what is visible and returns a draft for the owner to check. It is told never to invent specs,
// retail prices, test results or included parts: those fields stay empty unless the photos or the note say them.
// Needs ANTHROPIC_API_KEY; without it the Quick List works as normal and this button is hidden.

const Draft = z.object({
  title: z.string().describe('Shopper-facing title: brand, item, key size or model. Under 80 characters. Plain words, no hype.'),
  brand: z.string().nullable().describe('Brand as printed on the item or box, else null.'),
  model: z.string().nullable().describe('Model number as printed, else null.'),
  barcode: z.string().nullable().describe('UPC/EAN digits only if clearly readable in a photo, else null.'),
  category: z.enum(categories.map((c) => c.slug) as [string, ...string[]]),
  condition: z.enum(conditions.map((c) => c.value) as [string, ...string[]]).nullable().describe('Only if the photos or note make it clear; else null.'),
  tested: z.enum(['works', 'not_working', 'untested']).nullable().describe('Only from the note; never guess. null if the note does not say.'),
  packaging: z.enum(['original', 'damaged', 'none']).nullable(),
  description: z.string().describe('2 to 4 short factual sentences a shopper needs. Only what the photos or note show. No specs that are not printed.'),
  included: z.string().nullable().describe('Accessories visible or stated, else null.'),
  missing: z.string().nullable().describe('Parts the note says are missing, else null.'),
  visible_damage: z.string().nullable().describe('Scratches, dents, torn box and similar that are visible, else null.'),
  price_dollars: z.number().nullable().describe('The selling price only if the note states one, else null.'),
  keywords: z.array(z.string()).max(10).describe('Search words shoppers might use.'),
  ebay_title: z.string().describe('eBay title, max 80 characters, brand and model first.'),
});
export type ListingDraft = z.infer<typeof Draft>;

const SYSTEM = `You help a discount store list returned and overstock items quickly. You get photos of one item and sometimes a short note from the owner.
Fill in a listing draft from what you can actually see or what the note says. The owner reviews every field before publishing.
Rules:
- Never invent specifications, wattage, sizes, materials, retail prices, warranty or features that are not printed in a photo or stated in the note.
- Never claim the item was tested or works unless the note says so.
- If something is unclear, leave that field null rather than guessing.
- The title and description are for shoppers: plain, specific, no marketing words.`;

export const assistantEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function draftFromPhotos(photos: { data: Buffer; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }[], note: string) {
  if (!assistantEnabled()) throw new Error('The listing assistant is not set up (no ANTHROPIC_API_KEY).');
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...photos.slice(0, 4).map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.mediaType, data: p.data.toString('base64') } })),
    { type: 'text', text: note.trim() ? `Owner's note: ${note.trim().slice(0, 1000)}` : 'No note from the owner.' },
  ];
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: zodOutputFormat(Draft) },
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The assistant could not describe these photos. Fill the listing in by hand.');
  if (!response.parsed_output) throw new Error('The assistant did not return a usable draft. Try again or fill it in by hand.');
  return response.parsed_output;
}
