import { Component, type ErrorInfo, type ReactNode } from 'react';
import { buildFrontendErrorReport } from './error-reporting.helpers';
import type { FrontendErrorBoundaryProps, FrontendErrorBoundaryState } from './error-reporting.types';
import { FrontendErrorFallback } from './FrontendErrorFallback';
import { frontendErrorReporter, readBrowserErrorContext } from './install-global-error-handlers';

/**
 * Reloads the running window.
 */
function reloadWindow(): void {
  window.location.reload();
}

/**
 * Catches render errors below it, reports each one to the bridge (P7), and
 * shows a minimal fallback instead of a blank WebView. React offers error
 * boundaries only as class components.
 */
export class FrontendErrorBoundary extends Component<FrontendErrorBoundaryProps, FrontendErrorBoundaryState> {
  /** Nothing has failed until React says so. */
  state: FrontendErrorBoundaryState = { hasError: false };

  /**
   * Switches to the fallback after a render error.
   * @returns The failed state.
   */
  static getDerivedStateFromError(): FrontendErrorBoundaryState {
    return { hasError: true };
  }

  /**
   * Reports the render error with React's component stack.
   * @param error The value the render threw.
   * @param info React's error info.
   */
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const report = this.props.report ?? frontendErrorReporter;
    report(buildFrontendErrorReport('render', error, readBrowserErrorContext('', info.componentStack ?? '')));
  }

  /**
   * Renders the children, or the fallback once a render failed.
   * @returns The rendered tree.
   */
  render(): ReactNode {
    if (this.state.hasError) {
      return <FrontendErrorFallback onReload={this.props.onReload ?? reloadWindow} />;
    }
    return this.props.children;
  }
}
