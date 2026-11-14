## What this estimates

The tokens an agentic coding model would consume to port [Ceph](https://github.com/ceph/ceph) to {{computed.targetNames | list}}, and what those tokens would cost at list prices on each model the report covers ([Prices](#/methods?section=prices) lists them). The answer is a range under stated assumptions, not a quote. Every figure traces to a line count, to a measurement of one real port, or to an assumption whose reason is written next to it.

It is not evidence that the result would work. The estimate prices the work of a port on the assumption that every component's port succeeds; nothing here measures whether a ported Ceph would pass Ceph's tests, keep data safe or perform, and the one port it is calibrated on is unfinished ([Calibration](#/calibration)). [What could make this wrong](#/methods?section=what-could-make-this-wrong) says what else it rests on, and [How to check this estimate](#/methods?section=how-to-check-this-estimate) what would test it.

It does not estimate:

- engineering time, calendar time or staffing;
- human review of what the model writes;
- CI, test clusters and the other infrastructure a port's tests need;
- the cost of being wrong: a port abandoned half way, data lost to a bug, work thrown away.

The method in one paragraph: count Ceph's source at a pinned commit; sort it into features and rate each one's difficulty; turn bytes into tokens; then apply the token pattern that one real port, [rgw-go](#/calibration), showed per token of finished code, with assumed multipliers for code harder or easier than what was measured and for languages other than Go. Each step is below, with its formula and every number it uses.

Figures on this page are the published **{{computed.scenario.label}}** scenario, the central one, with nothing changed. Where a single figure stands for the whole matrix it is for {{computed.target.name}} on {{computed.model.name}}, the model rgw-go ran on and the only one whose token use was measured. The [estimate page](#/) recomputes everything as you change an assumption.
