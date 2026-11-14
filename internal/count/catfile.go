package count

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"

	"golang.org/x/sync/errgroup"
)

// readBlobs streams the content of each blob in oids, in order, to fn through
// one git cat-file --batch process.
func (g gitDir) readBlobs(ctx context.Context, oids []string, fn func(i int, content []byte) error) error {
	if len(oids) == 0 {
		return nil
	}
	// Not errgroup.WithContext: its context ends when Wait returns, which
	// would kill git before cmd.Wait reaps it. A failing side cancels
	// instead, so that the other side's blocked pipe I/O ends with git.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "--git-dir="+string(g), "cat-file", "--batch", "--buffer") //nolint:gosec // the git directory is the operator's own repository, and no argument reaches a shell
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("starting git cat-file: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("starting git cat-file: %w", err)
	}
	if err = cmd.Start(); err != nil {
		return fmt.Errorf("starting git cat-file: %w", err)
	}

	// The requests are written while the replies are read: a pipe holds
	// far less than ceph's blobs, so writing them all first would deadlock.
	var eg errgroup.Group
	eg.Go(func() error {
		if werr := writeRequests(stdin, oids); werr != nil {
			cancel()
			return werr
		}
		return nil
	})
	eg.Go(func() error {
		r := bufio.NewReaderSize(stdout, 1<<20)
		for i, oid := range oids {
			content, rerr := readBatchReply(r, oid)
			if rerr == nil {
				rerr = fn(i, content)
			}
			if rerr != nil {
				cancel()
				return rerr
			}
		}
		return nil
	})
	err = eg.Wait()
	waitErr := cmd.Wait()
	if err != nil {
		return err
	}
	if waitErr != nil {
		return fmt.Errorf("git cat-file: %w", waitErr)
	}
	return nil
}

// writeRequests writes one object name per line and closes w, which ends the
// batch. A failed write sticks in the bufio.Writer and surfaces at Flush.
func writeRequests(w io.WriteCloser, oids []string) error {
	bw := bufio.NewWriter(w)
	for _, oid := range oids {
		fmt.Fprintln(bw, oid)
	}
	if err := errors.Join(bw.Flush(), w.Close()); err != nil {
		return fmt.Errorf("requesting blobs: %w", err)
	}
	return nil
}

// readBatchReply reads one "<oid> blob <size>\n<content>\n" reply.
func readBatchReply(r *bufio.Reader, oid string) ([]byte, error) {
	header, err := r.ReadString('\n')
	if err != nil {
		return nil, fmt.Errorf("reading blob %s: %w", oid, err)
	}
	fields := strings.Fields(header)
	if len(fields) != 3 || fields[0] != oid || fields[1] != "blob" {
		return nil, fmt.Errorf("reading blob %s: unexpected reply %q", oid, strings.TrimSpace(header))
	}
	size, err := strconv.Atoi(fields[2])
	if err != nil {
		return nil, fmt.Errorf("reading blob %s: size %q: %w", oid, fields[2], err)
	}
	content := make([]byte, size+1)
	if _, err := io.ReadFull(r, content); err != nil {
		return nil, fmt.Errorf("reading blob %s: %w", oid, err)
	}
	return content[:size], nil
}
