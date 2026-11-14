package data

import (
	"bytes"
	"encoding/json"
	"fmt"

	"go.yaml.in/yaml/v3"
)

// writeJSON writes n as compact JSON, keeping mapping keys in document
// order and timestamps as the literal text the author wrote; decoding into
// map[string]any would lose both.
func writeJSON(buf *bytes.Buffer, n *yaml.Node) error {
	switch n.Kind {
	case yaml.DocumentNode:
		return writeJSON(buf, n.Content[0])
	case yaml.AliasNode:
		return writeJSON(buf, n.Alias)
	case yaml.MappingNode:
		buf.WriteByte('{')
		for i := 0; i < len(n.Content); i += 2 {
			if i > 0 {
				buf.WriteByte(',')
			}
			key := n.Content[i]
			if key.Kind != yaml.ScalarNode {
				return fmt.Errorf("line %d: mapping key is not a scalar", key.Line)
			}
			if err := writeScalar(buf, key.Value, key.Line); err != nil {
				return err
			}
			buf.WriteByte(':')
			if err := writeJSON(buf, n.Content[i+1]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
		return nil
	case yaml.SequenceNode:
		buf.WriteByte('[')
		for i, c := range n.Content {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJSON(buf, c); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
		return nil
	case yaml.ScalarNode:
		if n.Tag == "!!timestamp" {
			return writeScalar(buf, n.Value, n.Line)
		}
		var v any
		if err := n.Decode(&v); err != nil {
			return fmt.Errorf("line %d: %w", n.Line, err)
		}
		return writeScalar(buf, v, n.Line)
	default:
		return fmt.Errorf("line %d: unsupported YAML node", n.Line)
	}
}

func writeScalar(buf *bytes.Buffer, v any, line int) error {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("line %d: %w", line, err)
	}
	buf.Write(b)
	return nil
}
