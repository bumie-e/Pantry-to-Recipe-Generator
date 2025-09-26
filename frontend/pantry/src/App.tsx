import './App.css';
import VideoUpload from './components/VideoUpload';
import { ToastContainer } from 'react-toastify';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Pantry-to-Recipe Generator</h1>
      </header>
      <main>
        <VideoUpload />
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;
