import ChatWindow from './components/ChatWindow'

function App() {
  return(
    <div className="app">
      <header className="app__header">
      <h1>Kino</h1>
      <p>Movie Suggestion Engine</p>
      </header>
      <ChatWindow />
    </div>
  )
}

export default App;
