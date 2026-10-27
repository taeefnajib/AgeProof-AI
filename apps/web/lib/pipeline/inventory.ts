import { imagePart, museJson, textPart } from "../meta/muse";
import {
  INVENTORY_PROMPT_VERSION,
  inventorySystemPrompt,
  inventoryUserPrompt,
} from "../prompts/inventory";
import { InventorySchema } from "../schema/inventory";

/** Step 1: room type + which vocabulary concepts are worth a SAM call. */
export async function runInventory(imageDataUrl: string) {
  const res = await museJson({
    op: "inventory",
    promptVersion: INVENTORY_PROMPT_VERSION,
    schemaName: "Inventory",
    schema: InventorySchema,
    system: inventorySystemPrompt(),
    user: [textPart(inventoryUserPrompt()), imagePart(imageDataUrl)],
  });
  // De-duplicate in case the model repeats a concept.
  res.data.concepts = [...new Set(res.data.concepts)];
  return res;
}
