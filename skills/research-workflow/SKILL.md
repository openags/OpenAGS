---
name: research-workflow
description: Dynamic research workflow management with self-reflection and backtracking
roles: [ags]
tools: [dispatch_agent, check_progress, ask_user]
triggers: ["research", "workflow", "pipeline", "run project", "start research", "always"]
version: "1.0.0"
---

## Research Workflow Management

When managing a research project, follow this adaptive workflow:

### Stage Progression (typical order, but flexible)

1. **Literature Review** → Understand the field
   - Dispatch: `dispatch_agent(role="literature", task="...")`
   - Expected output: Review notes in `literature/notes/`, BibTeX in references
   - Proceed when: Review covers key related work with cited papers

2. **Research Proposal** → Define the research question
   - Dispatch: `dispatch_agent(role="proposer", task="...")`
   - Expected output: Proposal document in `proposal/ideas/`
   - Proceed when: Clear hypotheses, methodology, and expected outcomes

3. **Experiments** → Validate the hypothesis
   - Dispatch: `dispatch_agent(role="experimenter", task="...")`
   - Expected output: Code in `experiments/code/`, results in `experiments/results/`
   - Proceed when: Code runs successfully and produces meaningful results
   - **Common backtrack**: If results don't support hypothesis → re-examine proposal

4. **Manuscript** → Write the paper
   - Dispatch: `dispatch_agent(role="writer", task="...")`
   - Expected output: LaTeX in `manuscript/main.tex`
   - Proceed when: All sections drafted with citations

5. **Peer Review** → Quality check
   - Dispatch: `dispatch_agent(role="reviewer", task="...")`
   - Expected output: Structured review with scores
   - **Common backtrack**: If scores < 6/10 → address specific feedback

### Self-Reflection Protocol

After each agent completes, reflect on:
- **Quality**: Is the output good enough for the next stage?
- **Consistency**: Does it align with previous stages?
- **Completeness**: Are there gaps that need filling?

If issues are found, you have three options:
1. **Fix**: Dispatch the same agent with more specific instructions
2. **Backtrack**: Go to an earlier stage to address root causes
3. **Consult**: Use `ask_user` to get human guidance
