/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GraphDescriptor, GraphMetadata } from "@google-labs/breadboard";
import { BuilderScopeInterface, BuilderNodeInterface } from "./types.js";
import {
  InputValues,
  OutputValues,
  AbstractNode,
  ScopeConfig,
} from "../runner/types.js";

import { Scope } from "../runner/scope.js";
import { swapCurrentContextScope } from "./default-scope.js";
import { TrappedDataReadWhileSerializing, TrapResult } from "./trap.js";

/**
 * Adds syntactic sugar to support unproxying and serialization of nodes/graphs.
 */
export class BuilderScope extends Scope implements BuilderScopeInterface {
  #isSerializing: boolean;

  #trapResultTriggered = false;

  // TODO:BASE, config of subclasses can have more fields
  constructor(
    config: ScopeConfig & {
      serialize?: boolean;
    } = {}
  ) {
    super(config);
    this.#isSerializing = config.serialize ?? false;
  }

  async serialize(
    node: AbstractNode,
    metadata?: GraphMetadata
  ): Promise<GraphDescriptor> {
    return super.serialize(
      typeof (node as BuilderNodeInterface).unProxy === "function"
        ? (node as BuilderNodeInterface).unProxy()
        : node,
      metadata
    );
  }

  serializing() {
    return this.#isSerializing;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asScopeFor<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: unknown[]) => {
      const oldScope = swapCurrentContextScope(this);
      try {
        return fn(...args);
      } finally {
        swapCurrentContextScope(oldScope);
      }
    }) as T;
  }

  createTrapResult<I extends InputValues, O extends OutputValues>(
    node: AbstractNode<I, O>
  ): O {
    if (!this.#isSerializing)
      throw new Error("Can't create fake result outside of serialization");

    // We expect at most one trap - the one for the final result - in a
    // statically graph generating handler function.
    if (this.#trapResultTriggered) throw new TrappedDataReadWhileSerializing();
    this.#trapResultTriggered = true;

    return new TrapResult(node) as unknown as O;
  }

  didTrapResultTrigger() {
    return this.#trapResultTriggered;
  }
}
