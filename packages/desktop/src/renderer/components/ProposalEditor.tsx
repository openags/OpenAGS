/**
 * ProposalEditor — thin wrapper around LatexEditor for the proposal module.
 */
import React from 'react'
import LatexEditor from './LatexEditor'

interface Props {
  projectId: string
  projectName: string
  chatPanel?: React.ReactNode
}

export default function ProposalEditor({ projectId, projectName, chatPanel }: Props): React.ReactElement {
  return <LatexEditor projectId={projectId} projectName={projectName} module="proposal" chatPanel={chatPanel} />
}
