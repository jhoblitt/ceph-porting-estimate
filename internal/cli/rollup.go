package cli

import (
	"errors"
	"log/slog"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func newRollupCmd(v *viper.Viper) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "rollup",
		Short: "Roll the line counts and data files up into report.json",
		Long:  "Run every check that check runs, then write report.json; nothing is written when a check fails.",
		Args:  cobra.NoArgs,
		PreRunE: func(*cobra.Command, []string) error {
			if v.GetString("out") == "" {
				return errors.New("--out is required")
			}
			return nil
		},
		RunE: func(cmd *cobra.Command, _ []string) error {
			res, err := checkData(cmd.OutOrStdout(), v.GetString("data"))
			if err != nil {
				return err
			}
			out := v.GetString("out")
			if err := res.Report.WriteFile(out); err != nil {
				return err
			}
			slog.InfoContext(cmd.Context(), "wrote report", slog.String("path", out))
			return nil
		},
	}
	addDataFlag(cmd)
	cmd.Flags().String("out", "", "path of the report.json to write (CEPHEST_OUT)")
	return cmd
}
