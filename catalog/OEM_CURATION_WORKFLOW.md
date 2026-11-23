# Official OEM catalog curation workflow

This is the production path for catalogue facts that MotorForm presents as sourced.
It deliberately separates collection from publication: a model must not be shown as
verified merely because an operator has found a brochure or a price page.

## Batch rules

1. Work one manufacturer batch at a time.
2. Capture every currently offered variant from the OEM price page, including fuel,
   gearbox, seating, ex-showroom price, source URL and the date checked.
3. Capture technical specifications and the exact equipment matrix from the current
   OEM brochure/model page. Keep unavailable information as `Not verified`.
4. Attach an official URL to every price, specification and equipment fact.
5. Run the importer with `dryRun: true`, then import only when all records validate.
6. Derive the eight launch-city figures using MotorForm's labelled internal estimate
   method. These are never dealer quotes.
7. Move the queue target from `source_collection` to `variant_capture`, then
   `quality_review`, and only then `published`.

## Independent review checklist

- Variant name, fuel, gearbox and ex-showroom amount match the current OEM source.
- Optional paint, accessory, insurance and dealer charges are not included as a
  factory variant price.
- Equipment is tied to the exact trim, not inferred from a model-level brochure photo.
- Source URLs resolve to the manufacturer domain and checked dates are current.
- The model has all active variants, not just the recommended automatic trim.
- Consumer-visible copy clearly labels city prices as estimates and source scope.

## Import contract

Use `POST /api/operator/catalog/import` with the source-stamped variant structure.
The endpoint is operator-authenticated, enforces payload limits and supports
`dryRun: true`. The reusable first-batch example is
`scripts/import-first-verified-batch.mjs`.

## Publication policy

An imported individual variant may support a recommendation or comparison only with
its own evidence. A model is marked `published` only once all active variants have
passed review. A price or feature that is awaiting evidence stays out of the verified
comparison data.
