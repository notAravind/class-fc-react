export const parser = "babel";

const componentClassMembers = ["state", "setState"];

const capitalize = (string) => {
  return string.replace(string[0], string[0].toUpperCase());
};

export default function transformer(file, api) {
  const j = api.jscodeshift;

  return j(file.source)
    .find(j.ClassDeclaration, (a) => {
      if (a.superClass) {
        return a.superClass.name === "Component";
      }
    })
    .forEach((path) => {
      let renderMethod,
        constructorExpression,
        ordinaryMethods = [];
      // const renderMethod = path.node.body.body.find(
      //   (node) => node.key.name === "render"
      // );
      // const ordinaryMethods = path.node.body.body.filter(
      //   (node) => node.key.name !== "render" && node.kind !== "constructor"
      // );

      // const constructorExpression = path.node.body.body.find(
      //   (node) => node.kind === "constructor"
      // );

      for (const node of path.node.body.body) {
        if (node.key.name === "render") {
          renderMethod = node;
        } else if (node.kind === "constructor") {
          constructorExpression = node;
        } else {
          ordinaryMethods.push(node);
        }
      }
      const useStatesExpression = [];

      const methodsConstructor = [];

      if (constructorExpression) {
        for (const expressions of constructorExpression.value.body.body) {
          const currentExpression = expressions.expression;
          if (
            currentExpression.callee &&
            currentExpression.callee.type === "Super"
          ) {
            // superMethodsConstructor.push(expressions);
            continue;
          } else if (
            currentExpression.type === "AssignmentExpression" &&
            currentExpression.operator === "=" &&
            currentExpression.left.type === "MemberExpression" &&
            currentExpression.left.property.name === "state" &&
            currentExpression.right.type === "ObjectExpression"
          ) {
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
          }
        }
      }
      // const useEffectExpression = j.expressionStatement();

      const methodsToArrow = ordinaryMethods.map((method) => {
        return j.variableDeclaration("const", [
          j.variableDeclarator(
            j.identifier(method.key.name),
            j.arrowFunctionExpression(
              [...method.value.params],
              j.blockStatement([
                ...method.value.body.body
                  .map((expr) => {
                    if (
                      expr.expression.callee &&
                      expr.expression.callee.object.type === "ThisExpression" &&
                      expr.expression.callee.property.name === "setState"
                    ) {
                      const { arguments: args } = expr.expression;

                      const stateExpressions = [];
                      for (const property of args[0].properties) {
                        const invokeState = j.expressionStatement(
                          j.callExpression(
                            j.identifier(`set${capitalize(property.key.name)}`),
                            [property.value]
                          )
                        );

                        stateExpressions.push(invokeState);
                      }
                      return stateExpressions;
                    }
                    return expr;
                  })
                  .flat(),
              ])
            )
          ),
        ]);
      });

      const arrowFuncExpression = j.arrowFunctionExpression(
        [j.identifier("props")],
        j.blockStatement([
          ...useStatesExpression,
          ...methodsToArrow,
          ...renderMethod.value.body.body,
        ])
      );

      const variableDeclarator = j.variableDeclarator(
        j.identifier(path.node.id.name),
        arrowFuncExpression
      );

      const newConstNode = j.variableDeclaration("const", [variableDeclarator]);
      j(path).insertBefore(newConstNode);
    })
    .toSource();
}
