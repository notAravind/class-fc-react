export const parser = "babel";

const componentClassMembers = ["state", "setState"];

const capitalize = (string) => {
  return string.replace(string[0], string[0].toUpperCase());
};

const isPropTypeStatic = (expression) => {
  return (
    expression.type &&
    expression.type === "ClassProperty" &&
    expression.static &&
    expression.key.name === "propTypes"
  );
};

const isDefaultPropTypeStatic = (expression) => {
  return (
    expression.type &&
    expression.type === "ClassProperty" &&
    expression.static &&
    expression.key.name === "defaultProps"
  );
};

const isSkipableNodes = (expression) => {
  return (
    (expression.key &&
      expression.key.name === "componentShouldUpdate" &&
      expression.key.name === "componentDidCatch" &&
      expression.key.name === "getDerivedStateFromProps") ||
    expression.key.name === ""
  );
};

const isSetStateExpression = (expression) => {
  return (
    expression.expression &&
    expression.expression.callee &&
    expression.expression.callee.object &&
    expression.expression.callee.object.type === "ThisExpression" &&
    expression.expression.callee.property.name === "setState"
  );
};

const isStateExpression = (expression) => {
  return (
    expression.expression &&
    expression.expression.type === "MemberExpression" &&
    expression.expression.object &&
    expression.expression.object.property &&
    expression.expression.object.property.name === "state"
  );
};

const isStateInitializer = (expression) => {
  return (
    expression.type === "AssignmentExpression" &&
    expression.operator === "=" &&
    expression.left.type === "MemberExpression" &&
    expression.left.property.name === "state" &&
    expression.right.type === "ObjectExpression"
  );
};

const isMemberMethod = (expression) => {
  return (
    expression &&
    expression.type === "CallExpression" &&
    expression.callee &&
    expression.callee.type &&
    expression.callee.type === "MemberExpression"
  );
};

const isRefInitializer = (expression) => {
  return (
    expression &&
    expression.type === "AssignmentExpression" &&
    expression.operator === "=" &&
    expression.left.type === "MemberExpression" &&
    expression.right.type === "CallExpression" &&
    expression.right.callee &&
    (expression.right.callee.name === "createRef" ||
      (expression.right.callee.type === "MemberExpression" &&
        expression.right.callee.object &&
        expression.right.callee.object.name === "React" &&
        expression.right.callee.property &&
        expression.right.callee.property.name === "createRef"))
  );
};

export default function transformer(file, api) {
  const j = api.jscodeshift;

  let propTypes = [];
  const memberToCallExpression = (memberExpression) => {
    return j.expressionStatement(
      j.callExpression(j.identifier(memberExpression.callee.property.name), [
        ...memberExpression.arguments,
      ])
    );
  };

  const classStateToHookState = (expression) => {
    return j.expressionStatement(j.identifier(expression.property.name));
  };
  const classSetStateToHookSetState = (memberExpression) => {};

  // This Would replace all `this.state`, `this.setState` and all other member expression into normal expression
  const sanitizeWholeExpressionForState = (method) => {
    return j.blockStatement([
      ...method.value.body.body
        .map((expr) => {
          if (isSetStateExpression(expr)) {
            const { arguments: args } = expr.expression;

            const stateExpressions = [];
            if (args[0].properties instanceof Array) {
              for (const property of args[0].properties) {
                const invokeState = j.expressionStatement(
                  j.callExpression(
                    j.identifier(`set${capitalize(property.key.name)}`),
                    [property.value]
                  )
                );

                stateExpressions.push(invokeState);
              }
            } else {
              const invokeState = j.expressionStatement(
                j.callExpression(j.identifier(`forceState`), [])
              );
              stateExpressions.push(invokeState);
            }
            return stateExpressions;
          }
          return expr;
        })
        .flat(),
    ]);
  };

  return j(file.source)
    .find(j.ClassDeclaration, (a) => {
      if (a.superClass) {
        return (
          a.superClass.name === "Component" ||
          a.superClass.name === "TaskComponent" ||
          a.superClass.name === "PureComponent"
        );
      }
    })
    .forEach((path) => {
      let renderMethod,
        constructorExpression,
        componentDidMountExpression,
        componentWillUnMountExpression,
        propTypesExpression,
        defaultPropTypesExpression,
        ordinaryMethods = [];

      for (const node of path.node.body.body) {
        if (node.key.name === "render") {
          renderMethod = node;
        } else if (node.kind === "constructor") {
          constructorExpression = node;
        } else if (node.key.name === "componentWillUnmount") {
          componentWillUnMountExpression = node;
        } else if (node.key.name === "componentDidMount") {
          componentDidMountExpression = node;
        } else if (isPropTypeStatic(node)) {
          propTypesExpression = node;
        } else if (isDefaultPropTypeStatic(node)) {
          defaultPropTypesExpression = node;
        } else if (isSkipableNodes(node)) {
        } else {
          ordinaryMethods.push(node);
        }
      }
      const useStatesExpression = [];

      const methodsConstructor = [];
      const useEffectExpressions = [];
      const useRefExpressionss = [];

      if (constructorExpression) {
        for (const expressions of sanitizeWholeExpressionForState(
          constructorExpression
        ).body) {
          const currentExpression = expressions.expression;
          if (!currentExpression) continue;
          if (
            currentExpression.callee &&
            currentExpression.callee.type === "Super"
          ) {
            // superMethodsConstructor.push(expressions);
            continue;
          } else if (isStateInitializer(currentExpression)) {
            for (const property of currentExpression.right.properties) {
              const stateName = property.key.name;
              const newState = j.variableDeclaration("const", [
                j.variableDeclarator(
                  j.arrayPattern([
                    j.identifier(stateName),
                    j.identifier(`set${capitalize(stateName)}`),
                  ]),
                  j.callExpression(j.identifier("useState"), [property.value])
                ),
              ]);

              useStatesExpression.push(newState);
            }
          } else if (isRefInitializer(currentExpression)) {
            const refName = currentExpression.left.property.name;

            const newRefExpression = j.variableDeclaration("const", [
              j.variableDeclarator(
                j.identifier(refName),
                j.callExpression(j.identifier("useRef"), [])
              ),
            ]);
            useRefExpressionss.push(newRefExpression);
          } else {
            useEffectExpressions.push(expressions);
          }
        }
      }

      const methodsToArrow = ordinaryMethods.map((method) => {
        return j.variableDeclaration("const", [
          j.variableDeclarator(
            j.identifier(method.key.name),
            j.arrowFunctionExpression(
              [...method.value.params],
              sanitizeWholeExpressionForState(method)
            )
          ),
        ]);
      });

      if (componentDidMountExpression) {
        const sanitizedComponentDidMount = sanitizeWholeExpressionForState(
          componentDidMountExpression
        );
        useEffectExpressions.push(...sanitizedComponentDidMount.body);
      }

      if (componentWillUnMountExpression) {
        const sanitizedComponentWillUnMount = sanitizeWholeExpressionForState(
          componentWillUnMountExpression
        );

        useEffectExpressions.push(
          j.returnStatement(
            j.arrowFunctionExpression([], sanitizedComponentWillUnMount)
          )
        );
      }
      const useEffect =
        useEffectExpressions.length > 0
          ? j.expressionStatement(
              j.callExpression(j.identifier("useEffect"), [
                j.arrowFunctionExpression(
                  [],
                  j.blockStatement([...useEffectExpressions])
                ),
                j.arrayExpression([]),
              ])
            )
          : undefined;

      const allExpression = [];

      allExpression.push(...useStatesExpression);
      allExpression.push(...useRefExpressionss);
      if (useEffect) {
        allExpression.push(useEffect);
      }

      allExpression.push(...methodsToArrow);
      allExpression.push(...renderMethod.value.body.body);

      const arrowFuncExpression = j.arrowFunctionExpression(
        [j.identifier("props")],
        j.blockStatement(allExpression)
      );

      const componentName = path.node.id.name;

      const variableDeclarator = j.variableDeclarator(
        j.identifier(componentName),
        arrowFuncExpression
      );

      const newConstNode = j.variableDeclaration("const", [variableDeclarator]);

      j(newConstNode)
        .find(j.BlockStatement)
        .forEach((path) => {
          const allExpressions = [];
          for (const expression of path.node.body) {
            if (
              expression.expression &&
              expression.expression.type === "CallExpression" &&
              expression.expression.callee &&
              expression.expression.callee.type === "MemberExpression" &&
              expression.expression.callee.property &&
              expression.expression.callee.property.name === "setState"
            ) {
              const { arguments: args } = expression.expression;

              const stateExpressions = [];
              if (args[0].properties instanceof Array) {
                for (const property of args[0].properties) {
                  const invokeState = j.expressionStatement(
                    j.callExpression(
                      j.identifier(`set${capitalize(property.key.name)}`),
                      [property.value]
                    )
                  );

                  stateExpressions.push(invokeState);
                }
              } else {
                const invokeState = j.expressionStatement(
                  j.callExpression(j.identifier(`forceState`), [])
                );
                stateExpressions.push(invokeState);
              }
              allExpressions.push(...stateExpressions);
            } else {
              allExpressions.push(expression);
            }
          }
          j(path).replaceWith(j.blockStatement(allExpressions));
        });

      j(newConstNode)
        .find(j.Expression, {
          type: "MemberExpression",
          object: {
            type: "MemberExpression",
            object: {
              type: "ThisExpression",
            },
            property: {
              name: "state",
            },
          },
        })
        .forEach((path) => {
          const expression = path.node;
          const stateExpression = j.identifier(expression.property.name);
          j(path).replaceWith(stateExpression);
        });
      j(newConstNode)
        .find(j.MemberExpression, {
          object: {
            type: "MemberExpression",
            object: { type: "ThisExpression" },
          },
        })
        .forEach((path) => {
          const memberExpression = path.node;

          if (memberExpression.object.property.name === "setState") {
            let transformed = j.identifier(memberExpression.property.name);

            j(path).replaceWith(transformed);
          }
        });

      j(newConstNode).find(j.MemberExpression, {
        object: { type: "ThisExpression" },
      });

      j(newConstNode)
        .find(j.MemberExpression, { object: { type: "ThisExpression" } })
        .forEach((path) => {
          const memberExpression = path.node;

          let transformed;

          transformed = j.identifier(memberExpression.property.name);

          j(path).replaceWith(transformed);
        });

      j(path).replaceWith(newConstNode);

      if (propTypesExpression) {
        const propTypeExpressionNew = j.expressionStatement(
          j.assignmentExpression(
            "=",
            j.memberExpression(
              j.identifier(componentName),
              j.identifier("propTypes")
            ),
            propTypesExpression.value
          )
        );

        if (
          path.parent.value.type === "ExportNamedDeclaration" ||
          path.parent.value.type === "ExportDefaultDeclaration"
        ) {
          path.parent.insertAfter(propTypeExpressionNew);
        } else {
          path.insertAfter(propTypeExpressionNew);
        }
      }

      if (defaultPropTypesExpression) {
        const defaultPropTypesExpressionNew = j.expressionStatement(
          j.assignmentExpression(
            "=",
            j.memberExpression(
              j.identifier(componentName),
              j.identifier("defaultProps")
            ),
            defaultPropTypesExpression.value
          )
        );
        if (
          path.parent.value.type === "ExportNamedDeclaration" ||
          path.parent.value.type === "ExportDefaultDeclaration"
        ) {
          path.parent.insertAfter(defaultPropTypesExpressionNew);
        } else {
          path.insertAfter(defaultPropTypesExpressionNew);
        }
      }
    })
    .toSource();
}
