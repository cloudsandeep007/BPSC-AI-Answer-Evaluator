// Seeds reference rows into tables that already exist.
//
//   npm run seed
//
// This is data, not schema, so it does not need a migration - it writes rows
// through the normal API. Safe to re-run: it upserts by (exam, version).

import "dotenv/config";
import { supabase } from "./supabase";
import { RUBRIC_V1, RUBRIC_VERSION } from "./content/rubric";

async function seedRubric(): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from("rubrics")
    .select("id, version")
    .eq("exam", "BPSC")
    .eq("version", RUBRIC_VERSION)
    .maybeSingle();
  if (selectError) throw selectError;

  const row = {
    exam: "BPSC",
    paper: null, // applies to every paper; slot type drives the weighting, not the paper
    version: RUBRIC_VERSION,
    dimensions: RUBRIC_V1 as unknown as Record<string, unknown>,
    is_active: true,
  };

  if (existing) {
    const { error } = await supabase.from("rubrics").update(row).eq("id", existing.id);
    if (error) throw error;
    console.log(`rubrics: updated existing v${RUBRIC_VERSION}`);
  } else {
    const { error } = await supabase.from("rubrics").insert(row);
    if (error) throw error;
    console.log(`rubrics: inserted v${RUBRIC_VERSION}`);
  }

  // Only one rubric may be active at a time - Stage B fetches "the active
  // rubric" and must never find two.
  const { error: deactivateError } = await supabase
    .from("rubrics")
    .update({ is_active: false })
    .eq("exam", "BPSC")
    .neq("version", RUBRIC_VERSION);
  if (deactivateError) throw deactivateError;
}

async function main(): Promise<void> {
  await seedRubric();
  console.log("seed complete");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
