# Image-use permissions needed before Stage 2

**Status (reviewed in Stage 1.5):** nothing verified yet. Stage 2 (any processing of advertiser images) is **blocked** until the written approvals P1–P4 below are on file. This is not legal advice. If a store or Awin gives unclear answers, ask a lawyer before going ahead.

## What Stage 2 would do with advertiser images

Read this list exactly when asking for permission; the people approving need to know precisely what they're agreeing to.

1. **Display:** show product photos to 3–4 human raters in a private labelling page, loaded from the store's own CDN (`cdn.shopify.com`) the same way the app shows them. No copies are kept.
2. **Temporary copies:** download a small copy (at most 512 px) of the first photo of about 200 products, later the whole catalog. The copies are kept only on the evaluation computer or CI runner, deleted after the run, and never committed to GitHub or shared.
3. **Analysis on our own machines:** run open-source image models (SigLIP 2, Marqo e-commerce, DINOv2, OpenCLIP) locally to compute:
   - **embeddings**: a list of numbers summarising each photo's look;
   - a **perceptual hash** (a duplicate fingerprint);
   - the photo type (cut-out or room photo);
   - simple appearance attributes.

   The images are never sent to any hosted AI service.
4. **Storage of derived data:** keep only the numbers and labels (not the images), tied to the product id. If approved later, store them in our database to recommend **that advertiser's** products inside CureAvo, with every buy link going to the store through Awin as today.
5. **No other use:** the images and derived data are not used to train or fine-tune a model, are not sold or shared, are not used for other advertisers' products, and are not used outside CureAvo.
6. **Deletion:** if a program ends or permission is withdrawn, the embeddings and labels derived from that advertiser's images are deleted within 30 days.

## The four permissions, one by one (Stage 1.5 review)

Each activity needs its own yes; a yes to one doesn't imply the others. "Advertiser Materials" in Awin's terms include images and data, so every row involves both Awin's Publisher Terms and the store's own program terms.

| # | Activity | What exactly happens | Permission needed | Lowest-risk way to do it | Status |
| --- | --- | --- | --- | --- | --- |
| P1 | **Private human annotation** | 3–4 named raters see product photos in the local labelling page, loaded straight from the store's own image CDN (`cdn.shopify.com`) as the app does. Nothing is stored except their answers. | That showing feed images to a small private panel, outside CureAvo's public "promotional space", for the purpose of improving how CureAvo recommends the advertiser's products, is within the licence. | Load from the CDN at display time (no copies). Raters agree not to save or share images. | **Not confirmed** |
| P2 | **Temporary processing** | A ≤512 px copy of the first photo of each product is downloaded to the machine running the models, kept only for the run (hours), then deleted. Never committed, published or sent to a third party. | That **reproducing** the image temporarily (a copy) for automated analysis is allowed. Many licences allow *display* but are silent on copying. | Copies in a temporary folder outside the repository; deleted at the end of the run (the harness refuses folders inside the repo); local models only (no hosted AI service). | **Not confirmed** |
| P3 | **Generated embeddings** | Open-source models compute a list of numbers per photo (a "derived work" in some readings), plus a duplicate fingerprint (perceptual hash) and a photo type. | That creating **derived data** from the images is allowed, and that this isn't a prohibited "modification" or "derivative work". It also covers using that data only to rank that advertiser's products inside CureAvo. | Store numbers only (never images), tagged with model version and source; no training or fine-tuning on the images; not shared, sold or used for other brands' products. | **Not confirmed** |
| P4 | **Retention of derived attributes** | The embeddings, fingerprints and attributes (silhouette, finish, wood tone …) are kept in CureAvo's database while the product is active, to recommend it. | **How long** derived data may be kept, and what happens when (a) a product leaves the feed, (b) the program ends, or (c) the advertiser asks. Some program terms require deleting or returning "brand materials" when participation ends. | Delete per product within 30 days of it leaving the feed. Delete all of an advertiser's derived data within 30 days of the program ending or on request. Labels from people stay (they are CureAvo's own observations), but without the image. | **Not confirmed** |

**Calibration needs none of these:** it uses only CureAvo's own drawings. **The real-image pilot needs P1–P4 from all three advertisers** (or the pilot is restricted to the stores that say yes) **and from Awin**: confirmation that the Publisher Terms allow it, or a written statement that the advertiser's consent is enough.

## What needs checking, and where

| Source | Where Devin finds it | What to look for |
| --- | --- | --- |
| Awin Publisher Terms (the version accepted for account 3147062) | Awin dashboard → Account → Terms, or Awin's legal page for your region | The licence clause for "Advertiser Materials". These are defined to include images and data. Check: (a) whether use is limited to "promoting the Advertiser" on approved "Promotional Space"; (b) any ban on modifying, altering or creating derivative works; (c) caching or storage limits; (d) deletion on termination; (e) any mention of data mining, scraping, AI or machine learning. |
| Awin Storefront Addendum (Nov 2025), if it applies to app-style product pages | Awin legal documents | Whether a product-discovery app counts as a "Storefront" or Promotional Space, and what it allows with feed images. |
| **Tribesigns** program terms (Awin 92307) | Awin → Advertisers → Tribesigns → Terms; also `ui.awin.com/merchant-profile-terms/92307` | Feed and image use, "no alteration", scraping bans, AI/ML clauses, brand guidelines. |
| **Sicotas** program terms (Awin 110532) | as above, id 110532 | as above |
| **Welax** (HONSIT FURNITURE CO., LIMITED) program terms (Awin 108888) | as above, id 108888 | as above |
| Your promotional-space description in Awin | Awin → Account → Promotional spaces | That it describes CureAvo as an app that recommends products using their images, so the use matches what advertisers approved. |

Two research limits apply. Earlier research found that Awin defines Advertiser Materials to include images, and that some programs limit use to feed content as supplied. It did **not** find a clause that clearly allows or forbids computing embeddings. This session couldn't open awin.com because the host isn't in its network allowlist, so the exact clauses must be read from your account.

## Approval to request in writing

Send this through Awin messaging to each advertiser, copying Awin publisher support, and keep the replies:

> CureAvo (Awin publisher 3147062) is a furniture discovery app that recommends your products and links to your store through Awin. We would like to improve recommendations by analysing the product photos in your Awin feed, as follows:
> 1. We show your photos (loaded from your image CDN) to a small private panel of 3–4 people, who rate how similar products look.
> 2. We make temporary, small (≤512 px) copies on our own computers. They are never published, never stored in a code repository, and deleted after processing.
> 3. We run open-source image models on our own computers (no third-party AI services) to compute numeric similarity data ("embeddings"), duplicate fingerprints and simple style attributes for each product.
> 4. We keep only this derived data, linked to your product ids, to recommend your products inside CureAvo. All purchases still go through our Awin tracking links.
> 5. We do not use your images or this data to train AI models, share or sell them, or use them for other brands' products. We delete the derived data within 30 days if our partnership ends or if you ask.
>
> Could you confirm, for each of the four points, whether it is permitted: (1) showing your photos to our private rating panel, (2) temporary copies for processing, (3) computing and using the derived numeric data, and (4) keeping that data while your products are listed, with deletion within 30 days after a product or the partnership ends? If you have conditions, such as attribution or a different deletion timeframe, please tell us.

**What counts as approval:** a written yes from each advertiser (an email or Awin message is enough), plus confirmation from Awin, or a clear clause in the accepted terms, that nothing in the Publisher Terms forbids it. Record each approval (who, date, scope) in this file. Those records are the `--approval-ref` the model harness asks for.

**If an advertiser says no or doesn't answer:** that store's products are left out of Stage 2. This is a big gap: Tribesigns is more than half the catalog. The study could still go ahead on the stores that agree, with the store-shortcut checks adjusted.

## Safeguards that apply regardless (already built in)

- The model harness refuses to embed without `--approval-ref`, refuses an image folder inside the repository, and works with the network switched off (`HF_HUB_OFFLINE`).
- The annotation page's security policy allows images only from our own drawings or `cdn.shopify.com`. It cannot send anything anywhere.
- The manifest stores photo **addresses** only, never images or affiliate links.
- Retailer images are never sent to hosted AI services.

## Separately

The 8 onboarding room photos (`assets/rooms`) still need their own licence records. That task is already on Devin's list and is unrelated to this study.
