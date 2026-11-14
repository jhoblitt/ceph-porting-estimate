package cli

import "github.com/spf13/cobra"

func newRollupCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "rollup",
		Short: "Roll the line counts and data files up into report.json",
		Args:  cobra.NoArgs,
		RunE: func(*cobra.Command, []string) error {
			return errNotImplemented
		},
	}
}
