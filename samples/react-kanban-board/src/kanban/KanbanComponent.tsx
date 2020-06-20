import * as React from 'react';
import styles from './KanbanComponent.module.scss';
import * as strings from 'KanbanBoardStrings';

import { IKanbanTask } from './IKanbanTask';
import { IKanbanBoardTaskSettings } from './IKanbanBoardTaskSettings';
import { IKanbanBoardTaskActions } from './IKanbanBoardTaskActions';
import { IKanbanBoardRenderers } from './IKanbanBoardRenderers';
import { IKanbanBucket } from './IKanbanBucket';
import KanbanBucket from './KanbanBucket';
import KanbanTaskManagedProp from './KanbanTaskManagedProp';

import { Dialog, DialogType, DialogFooter } from 'office-ui-fabric-react/lib/Dialog';
import { PrimaryButton, DefaultButton } from 'office-ui-fabric-react/lib/Button';
import { IStackStyles, Stack } from 'office-ui-fabric-react/lib/Stack';
import { clone } from '@microsoft/sp-lodash-subset';

import { CommandBar } from 'office-ui-fabric-react/lib/CommandBar';
import { stringIsNullOrEmpty } from '@pnp/common';
import { TooltipHost } from 'office-ui-fabric-react';

export interface IKanbanComponentProps {
    buckets: IKanbanBucket[];
    tasks: IKanbanTask[];
    tasksettings: IKanbanBoardTaskSettings;
    taskactions: IKanbanBoardTaskActions;
    showCommandbar?: boolean;
    renderers?: IKanbanBoardRenderers;
    allowEdit?: boolean;
    allowAdd?: boolean;
    editSchema?: boolean;
    /*
    showCommandbarNew: boolean;
    allowDialog: boolean;  TODO im mock
    */
}

export interface IKanbanComponentState {
    leavingTaskId?: string;
    leavingBucket?: string;
    overBucket?: string;
    openDialog: boolean;
    openTaskId?: string;
    dialogState?: DialogState;
    editTask?: IKanbanTask;
    addBucket?: IKanbanBucket;
}

export enum DialogState {
    New = 1,
    Edit = 2,
    Display = 3
}

export default class KanbanComponent extends React.Component<IKanbanComponentProps, IKanbanComponentState> {
    private dragelement?: IKanbanTask;
    constructor(props: IKanbanComponentProps) {
        super(props);

        this.state = {
            openDialog: false,
            leavingTaskId: null,
            leavingBucket: null,
            overBucket: null
        };

    }

    public render(): React.ReactElement<IKanbanComponentProps> {
        const { buckets, tasks, tasksettings, taskactions, showCommandbar } = this.props;
        const { openDialog } = this.state;
        const { leavingBucket, leavingTaskId, overBucket } = this.state;
        const wrappedTaskActions: IKanbanBoardTaskActions = {

        };

        return (
            <div>
                {showCommandbar && <CommandBar
                    items={this.getItems()}

                    farItems={this.getFarItems()}
                    ariaLabel={'Use left and right arrow keys to navigate between commands'}
                />}
                <div className={styles.kanbanBoard}>
                    {

                        buckets.map((b) => {
                            const merge = { ...b, ...this.state }
                            return (<KanbanBucket
                                key={b.bucket}
                                {...merge}
                                buckettasks={tasks.filter((x) => x.bucket == b.bucket)}
                                tasksettings={tasksettings}

                                toggleCompleted={this.props.taskactions && this.props.taskactions.toggleCompleted ? this.props.taskactions.toggleCompleted : undefined}

                                addTask={this.internalAddTask.bind(this)}
                                openDetails={this.internalOpenDialog.bind(this)}

                                onDrop={this.onDrop.bind(this)}
                                onDragLeave={this.onDragLeave.bind(this)}
                                onDragOver={this.onDragOver.bind(this)}
                                onDragStart={this.onDragStart.bind(this)}
                                onDragEnd={this.onDragEnd.bind(this)}
                            />);

                        }

                        )}
                </div>
                {openDialog && (this.renderDialog())}
            </div>
        );
    }
    private getTaskByID(taskId: string): IKanbanTask {
        const tasks = this.props.tasks.filter(t => t.taskId == this.state.openTaskId);
        if (tasks.length == 1) {
            return tasks[0];
        }
        throw "Error Taks not found by taskId";
    }

    private renderDialog(): JSX.Element {
        let renderer: (task?: IKanbanTask, bucket?: IKanbanBucket) => JSX.Element = () => (<div>Dialog Renderer Not Set</div>);
        let task: IKanbanTask = undefined;
        let bucket: IKanbanBucket = undefined;
        let dialogheadline:string ='';
        switch (this.state.dialogState) {
            case DialogState.Edit:
                task = this.getTaskByID(this.state.openTaskId);
                renderer = this.internalTaskEditRenderer.bind(this);
                dialogheadline =strings.EditTaskDlgHeadline;
                break;
            case DialogState.New:
                renderer = this.internalTaskAddRenderer.bind(this);
                dialogheadline =strings.AddTaskDlgHeadline;
                break;
            default:
                task = this.getTaskByID(this.state.openTaskId);
                dialogheadline =task.title;
                renderer = (this.props.renderers && this.props.renderers.taskDetail) ? this.props.renderers.taskDetail : this.internalTaskDetailRenderer.bind(this);

                break;
        }

        return (<Dialog
            minWidth={600}
            hidden={!this.state.openDialog}
            onDismiss={this.internalCloseDialog.bind(this)}
            dialogContentProps={{
                type: DialogType.largeHeader,
                title: dialogheadline,
                subText: ''
            }}
            modalProps={{
                isBlocking: false,
                styles: { main: { minWidth: 600 } }
            }}
        >
            {renderer(task, bucket)}

            <DialogFooter>
                {(this.props.allowEdit && this.state.dialogState === DialogState.Display) &&
                    (<PrimaryButton onClick={this.clickEditTask.bind(this)} text={strings.EditTaskBtn} />)}
                {(this.props.allowEdit && this.state.dialogState === DialogState.Edit) &&
                    (<PrimaryButton onClick={this.saveEditTask.bind(this)} text={strings.SaveTaskBtn} />)}
                {(this.props.allowAdd && this.state.dialogState === DialogState.New) &&
                    (<PrimaryButton onClick={this.saveAddTask.bind(this)} text={strings.SaveAddTaskBtn} />)}
                <DefaultButton onClick={this.internalCloseDialog.bind(this)} text={strings.CloseTaskDialog} />
            </DialogFooter>

        </Dialog>);


        // Error Not found or more than one

        return (<div></div>);

    }

    private clickEditTask(): void {
        const task = this.getTaskByID(this.state.openTaskId);
        if (this.props.taskactions.taskEdit) {

            this.internalCloseDialog();
            this.props.taskactions.taskEdit(clone(task));
        } else {
            this.setState({
                dialogState: DialogState.Edit,
                editTask: clone(task)
            });
        }
    }
    private saveEditTask() {

        if (this.props.taskactions.editTaskSaved) {
            const edittask = clone(this.state.editTask);
            //check fist state and than event or in the other way
            this.internalCloseDialog();
            this.props.taskactions.editTaskSaved(edittask);
        } else {
            throw "allowEdit is Set but no handler is set";

        }
    }
    private saveAddTask() {

        if (this.props.taskactions.editTaskSaved) {
            const edittask = clone(this.state.editTask);
            //check fist state and than event or in the other way
            this.internalCloseDialog();
            this.props.taskactions.editTaskSaved(edittask);
        } else {
            throw "allowAdd is Set but no handler is set";

        }
    }



    private internalTaskDetailRenderer(task: IKanbanTask): JSX.Element {
        return (<Stack>
           
            {task.mamagedProperties && (
                task.mamagedProperties.map((p, i) => {
                    return (
                        <KanbanTaskManagedProp {...p} key={p.name + i} />
                    );
                })
            )}

        </Stack>
        );
    }


    private internalTaskEditRenderer(task: IKanbanTask): JSX.Element {
        const schema = this.props.editSchema; //TODO
        return (<div>Edit</div>);
    }
    private internalTaskAddRenderer(task?: IKanbanTask, bucket?: IKanbanBucket): JSX.Element {
        const schema = this.props.editSchema; //TODO
        return (<div>New</div>);
    }

    private internalCloseDialog(ev?: React.MouseEvent<HTMLButtonElement>) {
        this.setState({
            openDialog: false,
            openTaskId: undefined,
            dialogState: undefined,
            editTask: undefined,
            addBucket: undefined
        });
    }
    private internalOpenDialog(taskid: string) {
        this.setState({
            openDialog: true,
            openTaskId: taskid,
            dialogState: DialogState.Display
        });
    }
    private internalAddTask(targetbucket?: string) {
        let bucket: IKanbanBucket = undefined;
        if (bucket) {
            const buckets = this.props.buckets.filter((p) => p.bucket === targetbucket)
            if (buckets.length === 1) {
                bucket = clone(buckets[0]);
            } else {
                throw "Bucket not Found in addDialog";

            }
        }
        if (this.props.taskactions && this.props.taskactions.taskAdd) {
            this.props.taskactions.taskAdd(bucket);
        } else {
            this.setState({
                openDialog: true,
                openTaskId: '',
                dialogState: DialogState.New,
                addBucket: bucket
            });
        }
    }

    private onDragLeave(event): void {
        console.log('onDragLeave');
        /* if (this.bucketRef.current.classList.contains(styles.dragover)) {
             this.bucketRef.current.classList.remove(styles.dragover)
         }*/

    }

    private onDragEnd(event): void {
        console.log('onDragEnd');
        this.dragelement = undefined;
    }

    private onDragStart(event, taskId: string, bucket: string): void {
        console.log('onDragStart');

        const taskitem = this.props.tasks.filter(p => p.taskId === taskId);
        console.log('onDragStart taskitem');
        if (taskitem.length === 1) {
            console.log('onDragStart taskitem check done');
            event.dataTransfer.setData("text", taskId);
            //event.dataTransfer.setData("sourcebucket", bucket);
            //set element because event.dataTransfer is empty by DragOver
            console.log('set dragelement');
            this.dragelement = taskitem[0];
            this.setState({
                leavingTaskId: taskId,
                leavingBucket: bucket,
            });
            console.log('dragelement set and refresh state');
        } else {
            // Error not consitent
            console.log('onDragStart prop data wrong!!');
            throw "TaskItem not found on DragStart";

        }


    }

    private onDragOver(event, targetbucket: string): void {
        event.preventDefault();
        console.log('onDragOver this.dragelement');
        console.log(this.dragelement);

        if (this.dragelement.bucket !== targetbucket) {
            /* if (!this.bucketRef.current.classList.contains(styles.dragover)) {
                 this.bucketRef.current.classList.add(styles.dragover)
             }*/
        } else {

        }

    }

    private onDrop(event, targetbucket: string): void {
        console.log('onDrop');
        /* if (this.bucketRef.current.classList.contains(styles.dragover)) {
             this.bucketRef.current.classList.remove(styles.dragover)
         }*/
        if (this.dragelement.bucket !== targetbucket) {
            //event.dataTransfer.getData("text");
            const taskId = this.dragelement.taskId;
            const source = this.props.buckets.filter(s => s.bucket == this.dragelement.bucket)[0];
            const target = this.props.buckets.filter(s => s.bucket == targetbucket)[0];

            if (this.props.taskactions) {
                let allowMove = true;
                if (this.props.taskactions.allowMove) {
                    allowMove = this.props.taskactions.allowMove(taskId,
                        source,
                        target
                    );
                }
                if (allowMove && this.props.taskactions.moved) {
                    this.props.taskactions.moved(taskId, target);
                }
            }
        }
        this.dragelement = null;
        this.setState({
            leavingTaskId: null,
            leavingBucket: null,
            overBucket: null,
        });

    }

    private getItems = () => {
        if (this.props.allowAdd) {
            //TODO
            return [
                {
                    key: 'newItem',
                    name: 'New',
                    cacheKey: 'myAddBtnKey',
                    iconProps: {
                        iconName: 'Add'
                    },
                    onClick: () => this.internalAddTask.bind(this)
                }];
        }
        return [];

    }

    private getFarItems = () => {
        return [
            {
                key: 'info',
                name: 'Info',
                ariaLabel: 'Info',
                iconProps: {
                    iconName: 'Info'
                },
                iconOnly: true,
                onClick: () => console.log('Info')
            }
        ];
    };
}
