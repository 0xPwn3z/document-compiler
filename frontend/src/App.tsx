import { useEffect } from 'react'
import { useProject } from './hooks/useProject'
import { Landing } from './components/Landing'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'

export default function App() {
  const project = useProject()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && project.project) {
        event.preventDefault()
        void project.save()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [project])

  return (
    <div className="shell">
      <TopBar />
      <main>
        {project.project ? (
          <Workspace
            project={project.project}
            markdown={project.markdown}
            status={project.status}
            exporting={project.exporting}
            message={project.message}
            onSave={() => void project.save()}
            onMarkdownChange={project.onMarkdownChange}
            onExport={() => void project.exportDocx()}
            onMessage={(text, warning) => project.showMessage(text, warning)}
            onDismissMessage={project.dismissMessage}
          />
        ) : (
          <Landing onUpload={project.upload} />
        )}
      </main>
      <footer>
        Document Compiler <span aria-hidden="true">·</span> MVP locale per documenti sensibili
      </footer>
    </div>
  )
}
