package cli

import (
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/jhoblitt/ceph-porting-estimate/internal/count"
)

func newCountCmd(v *viper.Viper) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "count",
		Short: "Count source lines per file in a Ceph checkout",
		Args:  cobra.NoArgs,
		PreRunE: func(*cobra.Command, []string) error {
			for _, key := range []string{"repo", "rev", "out"} {
				if v.GetString(key) == "" {
					return fmt.Errorf("--%s is required", key)
				}
			}
			return nil
		},
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runCount(cmd, v.GetString("repo"), v.GetString("rev"), v.GetString("out"))
		},
	}
	f := cmd.Flags()
	f.String("repo", "", "path to the ceph checkout, read through git objects only (CEPHEST_REPO)")
	f.String("rev", "", "commit to count (CEPHEST_REV)")
	f.String("out", "", "file to write sloc.json to (CEPHEST_OUT)")
	return cmd
}

func runCount(cmd *cobra.Command, repo, rev, out string) (err error) {
	report, err := count.Count(cmd.Context(), repo, rev)
	if err != nil {
		return err
	}
	f, err := os.Create(out) //nolint:gosec // writing wherever the operator's --out names is the command's job
	if err != nil {
		return fmt.Errorf("creating %s: %w", out, err)
	}
	defer func() {
		if cerr := f.Close(); cerr != nil {
			err = errors.Join(err, fmt.Errorf("closing %s: %w", out, cerr))
		}
	}()
	if err := report.WriteJSON(f); err != nil {
		return fmt.Errorf("writing %s: %w", out, err)
	}
	slog.InfoContext(cmd.Context(), "counted",
		slog.String("rev", report.Rev),
		slog.Int("files", len(report.Files)),
		slog.Int("submodules", len(report.Submodules)),
		slog.String("out", out))
	return nil
}
