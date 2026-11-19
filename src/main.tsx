import { render } from 'preact';
import { Shell } from './app/Shell';
import './styles/app.css';
import './styles/screens.css';

render(<Shell />, document.getElementById('app')!);
