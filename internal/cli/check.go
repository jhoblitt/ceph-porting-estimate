package cli

import "github.com/spf13/cobra"

func newCheckCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "check",
		Short: "Validate the hand-edited data files",
		Args:  cobra.NoArgs,
		RunE: func(*cobra.Command, []string) error {
			return errNotImplemented
		},
	}
}
