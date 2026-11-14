# Calibration round: instructions

**Time needed:** about 10 minutes per rater. **Raters:** Devin (R1) and two people outside the project (R2, R3); a fourth (R4) makes it stronger. **Pictures:** CureAvo's own simple drawings only; no store photos are involved.

## For Devin (study lead)

1. **Get the file.**
   1. Open the repository on github.com in your browser.
   2. Go to `tools/annotate/` and click `cureavo-calibration-v2.html`.
   3. Click the **Download raw file** button (the downward arrow at the top right of the file view). The file lands in your Downloads folder.

   This one file contains the tool and all the questions. It has no answer key.
2. **Choose two raters.** Pick people who haven't seen this project's documents, and give them the codes R2 and R3. You are R1.
3. **Send each rater** the file plus the text in "For raters" below, by email or any messaging app. Don't tell them what the questions are testing, and don't share these documents with them.
4. **Do it yourself, alone.** Use the same steps as the raters.

   You know what the pack is designed to test, so the analysis is also run without your answers. That's expected, not a problem.
5. **Collect the answers.**
   - Each rater sends back one file named like `labels-calibration-v2-1-R2.json`. It contains only their code and answers: no name, no email.
   - Check you have one file per rater, then **attach all of them to your next message to Claude.** Claude puts them in `data/vision-eval/labels/calibration-v2-1/`, a **private, git-ignored** folder, and runs the analysis.
   - Only a de-identified summary (vote counts, median times) is committed, because the repository is public. Keep the original files yourself; they are the private record.
6. **Don't discuss answers** with the raters until all files are in.

## For raters (copy this into your message)

> Thanks for helping! This takes about 10 minutes, on a computer (a phone works, but saving the file at the end is easier on a computer).
>
> 1. Save the attached file `cureavo-calibration-v2.html` and double-click it. It opens in your web browser (Chrome, Edge, Safari or Firefox). If it opens in another program, right-click it → **Open with** → your browser. Nothing is installed, and nothing is sent anywhere while you work.
> 2. Type your code **R_** (the one I gave you), choose the pack, and click **Start / resume**.
> 3. Read the short introduction on the first screen. Most screens ask two things about the same pictures:
>    - **Structure:** the shape and build only (outline, proportions, legs or base, doors and cushions). Colour, finish and wood tone don't count.
>    - **Overall look:** would the same person be drawn to both? Shape **and** colour, wood tone, finish and texture all count.
>    - For both, ignore the photography: background, room, lighting.
> 4. Click your answers and then **Next** (or use the keys shown on screen). "Can't tell" is a perfectly good answer. Go with your first impression and don't look anything up.
> 5. Please do it in one sitting, on your own, and don't discuss it with anyone until I tell you everyone's done. If you get interrupted, reopen the same file in the same browser and type the same code; it continues where you stopped. (A private/incognito window won't remember progress.)
> 6. At the end, click **Download answers**. A file named like `labels-calibration-v2-1-R2.json` appears in your Downloads folder. Send that file back to me.

## What happens next

1. Claude checks the files and runs:

   ```bash
   npm run vision:calibration -- --labels data/vision-eval/labels/calibration-v2-1
   ```

   The report covers:
   - time per screen, including how much the second question on a screen costs;
   - agreement on each dimension;
   - whether people separated structure from overall look (shape vs colour, finishes, photography);
   - attention checks;
   - the realistic workload for the full round.
2. **If every gate passes,** the full-round plan is fixed from the measured times.
3. **If a gate fails,** the guidelines or questions are revised and a **new** pack, with new questions, is run. The same questions are never reused, because raters would remember them.
4. These answers are about our drawings only. They are never mixed with the real-catalog labels, and they never become training data or model inputs.
