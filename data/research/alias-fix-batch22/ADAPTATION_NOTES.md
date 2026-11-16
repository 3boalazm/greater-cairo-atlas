# Batch 22 North alias repair

The supplied `aliases_fix.json` and README are preserved unchanged. Each of the 23 North entity CSV cells was compared exactly with `aliases_before`, then changed to `aliases_after`; the importer also verifies the semicolon/Arabic-semicolon split, trimming, stable de-duplication and supplied count. The affected entities have **23 → 49** individually loaded aliases. No names, types, sectors, statuses or descriptions were changed by this repair. All other aliases are unchanged.
