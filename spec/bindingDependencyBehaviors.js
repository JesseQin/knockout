describe('Binding dependencies', function() {
    beforeEach(jasmine.prepareTestNode);

    it('If the binding handler depends on an observable, invokes the init handler once and the update handler whenever a new value is available', function () {
        var observable = new ko.observable();
        var initPassedValues = [], updatePassedValues = [];
        ko.bindingHandlers.test = {
            init: function (element, valueAccessor) { initPassedValues.push(valueAccessor()()); },
            update: function (element, valueAccessor) { updatePassedValues.push(valueAccessor()()); }
        };
        testNode.innerHTML = "<div data-bind='test: myObservable'></div>";

        ko.applyBindings({ myObservable: observable }, testNode);
        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);
        expect(initPassedValues[0]).toBeUndefined();
        expect(updatePassedValues[0]).toBeUndefined();

        observable("A");
        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(2);
        expect(updatePassedValues[1]).toEqual("A");
    });

    it('If the associated DOM element was removed by KO, handler subscriptions are disposed immediately', function () {
        var observable = new ko.observable("A");
        ko.bindingHandlers.anyHandler = {
            update: function (element, valueAccessor) { valueAccessor(); }
        };
        testNode.innerHTML = "<div data-bind='anyHandler: myObservable()'></div>";
        ko.applyBindings({ myObservable: observable }, testNode);

        expect(observable.getSubscriptionsCount()).toEqual(1);

        ko.removeNode(testNode);

        expect(observable.getSubscriptionsCount()).toEqual(0);
    });

    it('If the associated DOM element was removed independently of KO, handler subscriptions are disposed on the next evaluation', function () {
        var observable = new ko.observable("A");
        ko.bindingHandlers.anyHandler = {
            update: function (element, valueAccessor) { valueAccessor(); }
        };
        testNode.innerHTML = "<div data-bind='anyHandler: myObservable()'></div>";
        ko.applyBindings({ myObservable: observable }, testNode);

        expect(observable.getSubscriptionsCount()).toEqual(1);

        testNode.parentNode.removeChild(testNode);
        observable("B"); // Force re-evaluation

        expect(observable.getSubscriptionsCount()).toEqual(0);
    });

    it('If the binding attribute involves an observable, re-invokes the bindings if the observable notifies a change', function () {
        var observable = new ko.observable({ message: "hello" });
        var passedValues = [];
        ko.bindingHandlers.test = { update: function (element, valueAccessor) { passedValues.push(valueAccessor()); } };
        testNode.innerHTML = "<div data-bind='test: myObservable().message'></div>";

        ko.applyBindings({ myObservable: observable }, testNode);
        expect(passedValues.length).toEqual(1);
        expect(passedValues[0]).toEqual("hello");

        observable({ message: "goodbye" });
        expect(passedValues.length).toEqual(2);
        expect(passedValues[1]).toEqual("goodbye");
    });

    it('Should not reinvoke init for notifications triggered during first evaluation', function () {
        var observable = ko.observable('A');
        var initCalls = 0;
        ko.bindingHandlers.test = {
            init: function (element, valueAccessor) {
                initCalls++;

                var value = valueAccessor();

                // Read the observable (to set up a dependency on it), and then also write to it (to trigger re-eval of bindings)
                // This logic probably wouldn't be in init but might be indirectly invoked by init
                value();
                value('B');
            }
        };
        testNode.innerHTML = "<div data-bind='test: myObservable'></div>";

        ko.applyBindings({ myObservable: observable }, testNode);
        expect(initCalls).toEqual(1);
    });

    it('Should not run update before init, even if an associated observable is updated by a different binding before init', function() {
        // Represents the "theoretical issue" posed by Ryan in comments on https://github.com/SteveSanderson/knockout/pull/193

        var observable = ko.observable('A'), hasInittedSecondBinding = false, hasUpdatedSecondBinding = false;
        ko.bindingHandlers.test1 = {
            init: function(element, valueAccessor) {
                // Read the observable (to set up a dependency on it), and then also write to it (to trigger re-eval of bindings)
                // This logic probably wouldn't be in init but might be indirectly invoked by init
                var value = valueAccessor();
                value();
                value('B');
            }
        }
        ko.bindingHandlers.test2 = {
            init: function() {
                hasInittedSecondBinding = true;
            },
            update: function() {
                if (!hasInittedSecondBinding)
                    throw new Error("Called 'update' before 'init'");
                hasUpdatedSecondBinding = true;
            }
        }
        testNode.innerHTML = "<div data-bind='test1: myObservable, test2: true'></div>";

        ko.applyBindings({ myObservable: observable }, testNode);
        expect(hasUpdatedSecondBinding).toEqual(true);
    });

    it('Should be able to get all updates to observables in both init and update', function() {
        var lastBoundValueInit, lastBoundValueUpdate;
        ko.bindingHandlers.testInit = {
            init: function(element, valueAccessor) {
                ko.dependentObservable(function() {
                    lastBoundValueInit = ko.utils.unwrapObservable(valueAccessor());
                });
            }
        };
        ko.bindingHandlers.testUpdate = {
            update: function(element, valueAccessor) {
                lastBoundValueUpdate = ko.utils.unwrapObservable(valueAccessor());
            }
        };
        testNode.innerHTML = "<div data-bind='testInit: myProp()'></div><div data-bind='testUpdate: myProp()'></div>";
        var vm = ko.observable({ myProp: ko.observable("initial value") });
        ko.applyBindings(vm, testNode);
        expect(lastBoundValueInit).toEqual("initial value");
        expect(lastBoundValueUpdate).toEqual("initial value");

        // update value of observable
        vm().myProp("second value");
        expect(lastBoundValueInit).toEqual("second value");
        expect(lastBoundValueUpdate).toEqual("second value");

        // update value of observable to another observable
        vm().myProp(ko.observable("third value"));
        expect(lastBoundValueInit).toEqual("third value");
        expect(lastBoundValueUpdate).toEqual("third value");

        // update view model with brand-new property
        vm({ myProp: function() {return "fourth value"; }});
        expect(lastBoundValueInit).toEqual("fourth value");
        expect(lastBoundValueUpdate).toEqual("fourth value");
    });

    it('Should not update sibling bindings if a binding is updated', function() {
        var countUpdates = 0, observable = ko.observable(1);
        ko.bindingHandlers.countingHandler = {
            update: function() { countUpdates++; }
        }
        ko.bindingHandlers.unwrappingHandler = {
            update: function(element, valueAccessor) { valueAccessor(); }
        }
        testNode.innerHTML = "<div data-bind='countingHandler: true, unwrappingHandler: myObservable()'></div>";

        ko.applyBindings({ myObservable: observable }, testNode);
        expect(countUpdates).toEqual(1);
        observable(3);
        expect(countUpdates).toEqual(1);
    });

    it('Should not subscribe to observables accessed in init function', function() {
        var observable = ko.observable('A');
        ko.bindingHandlers.test = {
            init: function(element, valueAccessor) {
                var value = valueAccessor();
                value();
            }
        }
        testNode.innerHTML = "<div data-bind='if: true'><div data-bind='test: myObservable'></div></div>";

        ko.applyBindings({ myObservable: observable }, testNode);
        expect(observable.getSubscriptionsCount()).toEqual(0);
    });

    it('Should access latest value from extra binding when normal binding is updated', function() {
        delete ko.bindingHandlers.nonexistentHandler;
        var observable = ko.observable(), updateValue;
        var vm = {myObservable: observable, myNonObservable: "first value"};
        ko.bindingHandlers.existentHandler = {
            update: function(element, valueAccessor, allBindings) {
                valueAccessor()();  // create dependency
                updateValue = allBindings.get('nonexistentHandler');
            }
        }
        testNode.innerHTML = "<div data-bind='existentHandler: myObservable, nonexistentHandler: myNonObservable'></div>";

        ko.applyBindings(vm, testNode);
        expect(updateValue).toEqual("first value");
        vm.myNonObservable = "second value";
        observable.notifySubscribers();
        expect(updateValue).toEqual("second value");
    });

    it('Should update a binding when its observable is modified in a sibling binding', function() {
        // Represents an issue brought up in the forum: https://groups.google.com/d/topic/knockoutjs/ROyhN7T2WJw/discussion
        var latestValue, observable1 = ko.observable(1), observable2 = ko.observable();
        ko.bindingHandlers.updatedHandler = {
            update: function() { latestValue = observable2(); }
        }
        ko.bindingHandlers.modifyingHandler = {
            update: function() { observable2(observable1()); }
        }
        // The order of the bindings matters: this tests that a later binding will update an earlier binding
        testNode.innerHTML = "<div data-bind='updatedHandler: true, modifyingHandler: true'></div>";

        ko.applyBindings({}, testNode);
        expect(latestValue).toEqual(1);
        observable1(2);
        expect(latestValue).toEqual(2);
    });

    describe('Observable view models', function() {
        it('Should update bindings (including callbacks)', function() {
            var vm = ko.observable(), clickedVM;
            function checkVM(data) {
                clickedVM = data;
            }
            testNode.innerHTML = "<div><input data-bind='value:someProp' /><input type='button' data-bind='click: checkVM' /></div>";
            vm({ someProp: 'My prop value', checkVM: checkVM });
            ko.applyBindings(vm, testNode);
            expect(vm.getSubscriptionsCount()).toEqual(1);

            expect(testNode.childNodes[0].childNodes[0].value).toEqual("My prop value");

            // a change to the input value should be written to the model
            testNode.childNodes[0].childNodes[0].value = "some user-entered value";
            ko.utils.triggerEvent(testNode.childNodes[0].childNodes[0], "change");
            expect(vm().someProp).toEqual("some user-entered value");
            // a click should use correct view model
            ko.utils.triggerEvent(testNode.childNodes[0].childNodes[1], "click");
            expect(clickedVM).toEqual(vm());

            // set the view-model to a new object
            vm({ someProp: ko.observable('My new prop value'), checkVM: checkVM });
            expect(testNode.childNodes[0].childNodes[0].value).toEqual("My new prop value");

            // a change to the input value should be written to the new model
            testNode.childNodes[0].childNodes[0].value = "some new user-entered value";
            ko.utils.triggerEvent(testNode.childNodes[0].childNodes[0], "change");
            expect(vm().someProp()).toEqual("some new user-entered value");
            // a click should use correct view model
            ko.utils.triggerEvent(testNode.childNodes[0].childNodes[1], "click");
            expect(clickedVM).toEqual(vm());

            // clear the element and the view-model (shouldn't be any errors) and the subscription should be cleared
            ko.removeNode(testNode);
            vm(null);
            expect(vm.getSubscriptionsCount()).toEqual(0);
        });

        it('Should dispose view model subscription on next update when bound node is removed outside of KO', function() {
            var vm = ko.observable('text');
            testNode.innerHTML = "<div data-bind='text:$data'></div>";
            ko.applyBindings(vm, testNode);
            expect(vm.getSubscriptionsCount()).toEqual(1);

            // remove the element and re-set the view-model; the subscription should be cleared
            testNode.parentNode.removeChild(testNode);
            vm(null);
            expect(vm.getSubscriptionsCount()).toEqual(0);
        });

        it('Should update all child contexts (including values copied from the parent)', function() {
            ko.bindingHandlers.setChildContext = {
                init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                    ko.applyBindingsToDescendants(
                        bindingContext.createChildContext(function() { return ko.utils.unwrapObservable(valueAccessor()) }),
                        element);
                    return { controlsDescendantBindings : true };
                }
            };

            testNode.innerHTML = "<div data-bind='setChildContext:obj1'><span data-bind='text:prop1'></span><span data-bind='text:$root.prop2'></span></div>";
            var vm = ko.observable({obj1: {prop1: "First "}, prop2: "view model"});
            ko.applyBindings(vm, testNode);
            expect(testNode).toContainText("First view model");

            // change view model to new object
            vm({obj1: {prop1: "Second view "}, prop2: "model"});
            expect(testNode).toContainText("Second view model");

            // change it again
            vm({obj1: {prop1: "Third view model"}, prop2: ""});
            expect(testNode).toContainText("Third view model");

            // clear the element and the view-model (shouldn't be any errors) and the subscription should be cleared
            ko.removeNode(testNode);
            vm(null);
            expect(vm.getSubscriptionsCount()).toEqual(0);
        });

        it('Should update all extended contexts (including values copied from the parent)', function() {
            ko.bindingHandlers.withProperties = {
                init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                    var innerBindingContext = bindingContext.extend(valueAccessor);
                    ko.applyBindingsToDescendants(innerBindingContext, element);
                    return { controlsDescendantBindings : true };
                }
            };

            testNode.innerHTML = "<div data-bind='withProperties: obj1'><span data-bind='text:prop1'></span><span data-bind='text:prop2'></span></div>";
            var vm = ko.observable({obj1: {prop1: "First "}, prop2: "view model"});
            ko.applyBindings(vm, testNode);
            expect(testNode).toContainText("First view model");

            // ch ange view model to new object
            vm({obj1: {prop1: "Second view "}, prop2: "model"});
            expect(testNode).toContainText("Second view model");

            // change it again
            vm({obj1: {prop1: "Third view model"}, prop2: ""});
            expect(testNode).toContainText("Third view model");

            // clear the element and the view-model (shouldn't be any errors) and the subscription should be cleared
            ko.removeNode(testNode);
            vm(null);
            expect(vm.getSubscriptionsCount()).toEqual(0);
        });

        it('Should update an extended child context', function() {
            ko.bindingHandlers.withProperties = {
                init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                    var childBindingContext = bindingContext.createChildContext(null, null, function(context) {
                        ko.utils.extend(context, valueAccessor());
                    });
                    ko.applyBindingsToDescendants(childBindingContext, element);
                    return { controlsDescendantBindings: true };
                }
            };

            testNode.innerHTML = "<div data-bind='withProperties: obj1'><span data-bind='text:prop1'></span><span data-bind='text:$parent.prop2'></span></div>";
            var vm = ko.observable({obj1: {prop1: "First "}, prop2: "view model"});
            ko.applyBindings(vm, testNode);
            expect(testNode).toContainText("First view model");

            // ch ange view model to new object
            vm({obj1: {prop1: "Second view "}, prop2: "model"});
            expect(testNode).toContainText("Second view model");

            // change it again
            vm({obj1: {prop1: "Third view model"}, prop2: ""});
            expect(testNode).toContainText("Third view model");

            // clear the element and the view-model (shouldn't be any errors) and the subscription should be cleared
            ko.removeNode(testNode);
            vm(null);
            expect(vm.getSubscriptionsCount()).toEqual(0);
        });
    });

    describe('Order', function() {
        var bindingOrder;
        beforeEach(function() {
            bindingOrder = [];

            function makeBinding(name) {
                return { init: function() { bindingOrder.push(name); } };
            }
            ko.bindingHandlers.test1 = makeBinding(1);
            ko.bindingHandlers.test2 = makeBinding(2);
            ko.bindingHandlers.test3 = makeBinding(3);
            ko.bindingHandlers.test4 = makeBinding(4);
        });

        it('Should default to the order in the binding', function() {
            testNode.innerHTML = "<div data-bind='test1, test2, test3'></div>";
            ko.applyBindings(null, testNode);
            expect(bindingOrder).toEqual([1,2,3]);
        });

        it('Should be based on binding\'s "after" values, which override the default binding order', function() {
            ko.bindingHandlers.test2.after = ['test1'];
            ko.bindingHandlers.test3.after = ['test2'];
            testNode.innerHTML = "<div data-bind='test3, test2, test1'></div>";
            ko.applyBindings(null, testNode);
            expect(bindingOrder).toEqual([1,2,3]);
        });

        it('Should leave bindings without an "after" value where they are', function() {
            // This test is set up to be unambiguous, because only test1 and test2 are reorderd
            // (they have the dependency between them) and test3 is left alone.
            ko.bindingHandlers.test2.after = ['test1'];
            testNode.innerHTML = "<div data-bind='test2, test1, test3'></div>";
            ko.applyBindings(null, testNode);
            expect(bindingOrder).toEqual([1,2,3]);
        });

        it('Should leave bindings without an "after" value where they are (extended)', function() {
            // This test is ambiguous, because test3 could either be before test1 or after test2.
            // So we accept either result.
            ko.bindingHandlers.test2.after = ['test1'];
            testNode.innerHTML = "<div data-bind='test2, test3, test1'></div>";
            ko.applyBindings(null, testNode);
            expect(bindingOrder).toEqualOneOf([[1,2,3], [3,1,2]]);
        });

        it('Should throw an error if bindings have a cyclic dependency', function() {
            // We also verify that test4 and unknownBinding don't appear in the error message, because they aren't part of the cycle
            ko.bindingHandlers.test1.after = ['test3'];
            ko.bindingHandlers.test2.after = ['test1'];
            ko.bindingHandlers.test3.after = ['test4', 'test2'];
            ko.bindingHandlers.test4.after = [];
            testNode.innerHTML = "<div data-bind='test1, unknownBinding, test2, test4, test3'></div>";

            var didThrow = false;
            try { ko.applyBindings(null, testNode) }
            catch(ex) { didThrow = true; expect(ex.message).toContain('Cannot combine the following bindings, because they have a cyclic dependency: test1, test3, test2') }
            expect(didThrow).toEqual(true);
        })
    });
});
