import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  ToolbarButtonComponent,
  Dialog,
  showDialog,
  ReactWidget,
  ISessionContext,
  UseSignal
} from '@jupyterlab/apputils';

import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

import { KernelSpec } from '@jupyterlab/services';

import {
  ReadonlyPartialJSONObject,
  PartialJSONObject
} from '@lumino/coreutils';

import * as JSONSchemaForm from '@rjsf/core';

import * as React from 'react';

const Form = JSONSchemaForm.default;

type KernelSpec = { [key: string]: KernelSpec.ISpecModel | undefined };

/**
 * Initialization data for the kernel-spec extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'kernel-spec:plugin',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, notebookTracker: INotebookTracker) => {
    console.log('JupyterLab extension kernel-spec is activated!');

    notebookTracker.widgetAdded.connect(
      (sender: INotebookTracker, notebook: NotebookPanel) => {
        notebook.context.ready.then(() => {
          const kernel_specs = notebook.context.sessionContext.specsManager
            .specs?.kernelspecs as KernelSpec;

          console.debug(
            'Session:',
            notebook.context.sessionContext.kernelDisplayName
          );
          const button = ReactWidget.create(
            kernelNameComponent(notebook.context.sessionContext, kernel_specs)
          );

          notebook.toolbar.addItem('Kernel_specs_selector', button);
        });
      }
    );
  }
};

export default plugin;

function kernelNameComponent(
  session: ISessionContext,
  kernel_specs: KernelSpec
): JSX.Element {
  return (
    <UseSignal signal={session.kernelChanged} initialSender={session}>
      {sessionContext => (
        <ToolbarButtonComponent
          onClick={() => showKernelSpecsDialog(session, kernel_specs)}
          label={session?.kernelDisplayName}
        />
      )}
    </UseSignal>
  );
}

function createFakeSpecs(kernelSpecs: KernelSpec): KernelSpec {
  const fakeSpecs: KernelSpec = {};
  Object.entries(kernelSpecs).forEach(([name, spec]) => {
    if (name.includes('xcpp') && fakeSpecs['xcpp'] === undefined) {
      fakeSpecs['xcpp'] = EXAMPLE['xcpp'];
    } else if (name.includes('xsql') && fakeSpecs['xsql'] === undefined) {
      fakeSpecs['xsql'] = EXAMPLE['xsql'];
    } else if (!name.includes('xcpp') && !name.includes('xsql')) {
      fakeSpecs[name] = spec;
    }
  });
  return fakeSpecs;
}

async function showKernelSpecsDialog(
  session: ISessionContext,
  kernel_specs: KernelSpec
): Promise<void> {
  const body = new KernelSpecDialog(session.name, kernel_specs);
  const value = await showDialog({ title: 'Select Kernel', body });
  if (value.button.accept) {
    console.debug('Specs:', body.data);
    if (body.data) {
      session
        .changeKernel({ name: body.data.name })
        .then(() => console.debug('Kernel changed'))
        .catch(e => console.debug(e));
    }
  }
}

function createSchema(
  title: string,
  specs: KernelSpec.ISpecModel
): ReadonlyPartialJSONObject | undefined {
  const properties = specs.metadata?.parameters;
  if (properties) {
    return {
      title,
      type: 'object',
      properties
    };
  } else {
    return undefined;
  }
}

/**
 * A ReactWidget to render the kernel spec form.
 */
class KernelSpecDialog
  extends ReactWidget
  implements Dialog.IBodyWidget<ReactWidget>
{
  private _path: string;
  private _kernelSpecs: KernelSpec;
  private _fakeSpecs: KernelSpec;
  private _selected: KernelSpec.ISpecModel | undefined;
  private _specs: KernelSpec.ISpecModel | undefined;

  /**
   * Construct a `APIKeyDialog`.
   *
   * @param roles
   */
  constructor(path: string, kernelSpecs: KernelSpec) {
    super();
    this.addClass('jp-Dialog-body-KernelSpecs');

    this._path = path;
    this._kernelSpecs = kernelSpecs;
    this._fakeSpecs = createFakeSpecs(this._kernelSpecs);
    const key = Object.keys(this._fakeSpecs as ReadonlyPartialJSONObject)[0];
    this._selected = this._fakeSpecs[key];
    this._specs = this._kernelSpecs[key];
  }

  get data(): KernelSpec.ISpecModel | undefined {
    return this._specs;
  }

  private _handlerKernel = (event: React.ChangeEvent<HTMLSelectElement>) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this._selected = this._fakeSpecs[event.target.value];
    if (this._selected) {
      if (this._selected?.name === 'C++') {
        this._specs = this._kernelSpecs['xcpp11'];
      } else {
        this._specs = this._kernelSpecs[this._selected.name];
      }
    }
    this.update();
  };

  private _handlerSpecs = (
    e: JSONSchemaForm.IChangeEvent<unknown>,
    es?: JSONSchemaForm.ErrorSchema | undefined
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (
      this._selected &&
      this._selected.metadata &&
      this._selected.metadata.parameters
    ) {
      Object.entries(e.formData as any).forEach(([name, value]) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const parameters = this._selected!.metadata!
          .parameters as PartialJSONObject;
        (parameters[name] as PartialJSONObject).value = value as any;
      });
    }

    if (this._selected?.name === 'C++') {
      const version = (e.formData as any).cpp_version;
      this._specs = this._kernelSpecs[`xcpp${version}`];
    } else {
      this._specs = this._kernelSpecs[this._selected?.name as string];
    }
  };

  private _renderForm = () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const schema = createSchema(this._selected!.display_name, this._selected!);
    if (schema) {
      return (
        <Form schema={schema} onChange={this._handlerSpecs} children={true} />
      );
    }
    return;
  };

  render(): JSX.Element {
    const selectKernel = (): JSX.Element[] => {
      return Object.entries(this._fakeSpecs).map(([name, spec]) => (
        <option value={name}>{spec?.display_name}</option>
      ));
    };

    return (
      <div>
        <label>{`Select kernel for: "${this._path}"`}</label>
        <div className="jp-select-wrapper">
          <select
            id="kernel"
            className="jp-mod-styled jp-select-kernel"
            onChange={this._handlerKernel}
          >
            {selectKernel()}
          </select>
          {this._selected && this._renderForm()}
        </div>
      </div>
    );
  }
}

const EXAMPLE: KernelSpec = {
  xcpp: {
    name: 'C++',
    display_name: 'C++',
    argv: [
      '/home/carlos/micromamba/envs/kernel_spec/bin/xcpp',
      '-f',
      '{connection_file}',
      '-std=c++{cpp_version}'
    ],
    language: 'C++',
    env: {},
    metadata: {
      debugger: false,
      parameters: {
        cpp_version: {
          type: 'string',
          default: '14',
          enum: ['11', '14', '17'],
          save_to_notebook: true
        }
      }
    },
    resources: {
      'logo-32x32': '/kernelspecs/xcpp11/logo-32x32.png',
      'logo-64x64': '/kernelspecs/xcpp11/logo-64x64.png'
    }
  },
  xsql: {
    name: 'xsql',
    display_name: 'xsql',
    argv: [
      '/home/carlos/micromamba/envs/kernel_spec/bin/xsql',
      '-f',
      '{connection_file}',
      '-h',
      '{hostname}',
      '-p',
      '{password}'
    ],
    language: 'sqlite',
    env: {},
    metadata: {
      debugger: false,
      parameters: {
        hostname: {
          type: 'string',
          default: 'localhost',
          save_to_notebook: false
        },
        password: {
          type: 'string',
          default: '1234',
          format: 'password',
          save_to_notebook: false
        }
      }
    },
    resources: {
      'logo-32x32': '/kernelspecs/xsql/logo-32x32.png',
      'logo-64x64': '/kernelspecs/xsql/logo-64x64.png'
    }
  }
};
