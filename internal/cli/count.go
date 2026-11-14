package cli

import "github.com/spf13/cobra"

func newCountCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "count",
		Short: "Count source lines per file in a Ceph checkout",
		Args:  cobra.NoArgs,
		RunE: func(*cobra.Command, []string) error {
			return errNotImplemented
		},
	}
}
