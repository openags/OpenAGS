/**
 * ManuscriptEditor — thin wrapper around LatexEditor for the manuscript module.
 */
import React from 'react'
import LatexEditor from './LatexEditor'

interface Props {
  projectId: string
  projectName: string
  chatPanel?: React.ReactNode
}

export default function ManuscriptEditor({ projectId, projectName, chatPanel }: Props): React.ReactElement {
  return <LatexEditor projectId={projectId} projectName={projectName} module="manuscript" chatPanel={chatPanel} />
}
