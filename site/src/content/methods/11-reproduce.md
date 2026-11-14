## Reproduce or change it

Everything is in [`jhoblitt/ceph-porting-estimate`](https://github.com/jhoblitt/ceph-porting-estimate). The inputs are hand-edited YAML under [`data/`](https://github.com/jhoblitt/ceph-porting-estimate/tree/main/data): the taxonomy of features, the dependencies, the prices, the assumptions and the calibration measurements, beside the per-file line counts the counter wrote. The repository's README says how to recount Ceph at another commit and how to check the data after an edit.

No estimated token or dollar figure is stored. The build rolls the data up into one file, and your browser runs the cost model on it: every figure on these pages and on the estimate page is computed as the page loads, and the estimate page recomputes it as you move a slider or flip a switch. The address bar keeps your changes, so a link shares them.

To argue with a number, change the assumption behind it on the [estimate page](#/), or edit the YAML and rebuild.
