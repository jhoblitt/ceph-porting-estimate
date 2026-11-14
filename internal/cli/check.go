package cli

import (
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/jhoblitt/ceph-porting-estimate/internal/data"
	"github.com/jhoblitt/ceph-porting-estimate/internal/rollup"
)

func newCheckCmd(v *viper.Viper) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "check",
		Short: "Validate the hand-edited data files",
		Long: "Validate the data files against generated/sloc.json and print how much code " +
			"no feature glob claims. Every problem found is reported, not just the first.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			_, err := checkData(cmd.OutOrStdout(), v.GetString("data"))
			return err
		},
	}
	addDataFlag(cmd)
	return cmd
}

func addDataFlag(cmd *cobra.Command) {
	cmd.Flags().String("data", "data",
		"data directory; sloc.json is read from <data>/generated/sloc.json (CEPHEST_DATA)")
}

// checkData loads and checks the data directory dir, printing the
// unclassified summary to w whether or not the check passes.
func checkData(w io.Writer, dir string) (*rollup.Result, error) {
	s, err := data.Load(os.DirFS(dir))
	if err != nil {
		return nil, fmt.Errorf("loading %s: %w", dir, err)
	}
	res := rollup.Build(s)
	rollup.WriteUnclassified(w, res.Unclassified)
	if err := res.Problems.Err(); err != nil {
		return nil, fmt.Errorf("checking %s: %w", dir, err)
	}
	return res, nil
}
