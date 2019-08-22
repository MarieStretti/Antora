#!/bin/bash

# Package (aka module) release script.
# Refer to ../releasing.adoc for details about how this script works.

rm -rf build

# resolve the version number (exact) or increment keyword (next in sequence)
if [ -z $RELEASE_VERSION ]; then
  if [ -f releaserc ]; then
    . $(pwd)/releaserc
  else
    RELEASE_VERSION=prerelease
  fi
fi

if [ -z $RELEASE_BRANCH ]; then RELEASE_BRANCH=master; fi

# make sure the release branch exists as a local branch
git branch -f $RELEASE_BRANCH origin/$RELEASE_BRANCH

# don't run if this branch is behind the branch from which we're releasing
if [ "$(git merge-base --fork-point $RELEASE_BRANCH $CI_COMMIT_SHA)" != "$(git rev-parse $RELEASE_BRANCH)" ]; then
  echo $CI_COMMIT_REF_NAME is behind $RELEASE_BRANCH. This could indicate this release was already published. Aborting.
  exit 1
fi

# set up SSH auth using ssh-agent
mkdir -p -m 700 $HOME/.ssh
ssh-keygen -F gitlab.com >/dev/null 2>&1 || ssh-keyscan -H -t rsa gitlab.com >> $HOME/.ssh/known_hosts 2>/dev/null
eval $(ssh-agent -s) >/dev/null
echo -n "$RELEASE_SSH_PRIV_KEY" | ssh-add -

# clone the branch from which we're releasing
git clone -b $RELEASE_BRANCH --no-local . build/$CI_PROJECT_NAME

# switch to clone
cd build/$CI_PROJECT_NAME
git status -s -b

# configure git to push changes
git remote set-url origin "git@gitlab.com:$CI_PROJECT_PATH.git"
git config user.email "$RELEASE_GIT_EMAIL"
git config user.name "$RELEASE_GIT_NAME"

# configure npm settings to publish packages
for package in packages/*; do
  echo "access=public" > $package/.npmrc
  echo "//registry.npmjs.org/:_authToken=$RELEASE_NPM_TOKEN" >> $package/.npmrc
  mkdir -p $package/scripts
  for script in prepublish.js postpublish.js; do
    cat << EOF > $package/scripts/$script
require('child_process').execSync('node ../../scripts/$script', { cwd: require('path').resolve(__dirname, '..') })
EOF
  done
done

# release!
npm -v
if case $RELEASE_VERSION in major|minor|patch) ;; *) false;; esac; then
  lerna publish --cd-version=$RELEASE_VERSION --exact --force-publish=* --npm-tag=${RELEASE_NPM_TAG:=latest} --yes
elif case $RELEASE_VERSION in pre*) ;; *) false;; esac; then
  lerna publish --cd-version=$RELEASE_VERSION --exact --force-publish=* --npm-tag=${RELEASE_NPM_TAG:=next} --yes
else
  lerna publish --exact --force-publish=* --npm-tag=${RELEASE_NPM_TAG:=latest} --repo-version=$RELEASE_VERSION --yes
fi

git status -s -b

# nuke npm settings
#for package in packages/*; do
#  unlink $package/.npmrc
#  unlink $package/scripts/prepublish.js
#  unlink $package/scripts/postpublish.js
#  rmdir $package/scripts
#done

# nuke clone
cd -
rm -rf build

# kill the ssh-agent
eval $(ssh-agent -k) >/dev/null

# update releaserc with resolved values
echo "RELEASE_VERSION=$RELEASE_VERSION
RELEASE_BRANCH=$RELEASE_BRANCH
RELEASE_NPM_TAG=$RELEASE_NPM_TAG" > releaserc

exit 0
